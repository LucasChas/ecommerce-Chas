-- ============================================================================
-- Migración 0016: costo de envío y pago online (MercadoPago)
--
--   1) configuracion.envio_costo / envio_gratis_desde → envío con costo fijo
--      (y opcionalmente gratis desde cierto monto). null = "a coordinar".
--   2) pedidos.envio y pedidos.total → el total lo calcula la BASE, nunca el
--      front (igual que el subtotal desde la 0006).
--   3) pedidos.metodo_pago / pago_estado / mp_* → seguimiento del pago online.
--      El pago lo confirma SOLO el webhook de MercadoPago (Edge Function
--      webhook-mercadopago), que consulta la API de MP antes de marcarlo.
--   4) crear_pedido v3: variantes (0015), envío, método de pago, productos
--      ocultos y origen 'admin' reservado al admin. Los mensajes de error se
--      muestran tal cual al cliente: van sin voseo ni tuteo para servir a
--      cualquier tienda (ver idioma.trato en tienda.config.mjs).
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y
-- ejecutá. Es idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Envío en la configuración de la tienda
-- ----------------------------------------------------------------------------
alter table public.configuracion add column if not exists envio_costo numeric(10,2)
  check (envio_costo >= 0);
alter table public.configuracion add column if not exists envio_gratis_desde numeric(10,2)
  check (envio_gratis_desde >= 0);

-- ----------------------------------------------------------------------------
-- 2-3) Pedidos: envío, total y pago
-- ----------------------------------------------------------------------------
alter table public.pedidos add column if not exists envio numeric(10,2) not null default 0;
alter table public.pedidos add column if not exists total numeric(10,2)
  generated always as (subtotal + envio) stored;
alter table public.pedidos add column if not exists metodo_pago text not null default 'coordinar';
alter table public.pedidos add column if not exists pago_estado text not null default 'pendiente';
alter table public.pedidos add column if not exists mp_preference_id text;
alter table public.pedidos add column if not exists mp_payment_id text;

do $$
begin
  alter table public.pedidos add constraint pedidos_metodo_pago_valido
    check (metodo_pago in ('coordinar', 'mercadopago'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.pedidos add constraint pedidos_pago_estado_valido
    check (pago_estado in ('pendiente', 'aprobado', 'rechazado', 'reembolsado'));
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 4) crear_pedido v3
-- ----------------------------------------------------------------------------
drop function if exists public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text
);

create or replace function public.crear_pedido(
  p_nombre      text,
  p_telefono    text,
  p_email       text,
  p_entrega     text,
  p_direccion   text,
  p_localidad   text,
  p_cp          text,
  p_notas       text,
  p_items       jsonb,
  p_subtotal    numeric,            -- se ignora: el subtotal lo calcula la base
  p_origen      text default 'checkout',
  p_metodo_pago text default 'coordinar'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero      bigint;
  v_uid         uuid := auth.uid();
  v_admin       boolean := public.es_admin();
  v_item        jsonb;
  v_id          uuid;
  v_variante    uuid;
  v_cantidad    int;
  v_nombre      text;
  v_var_nombre  text;
  v_precio      numeric;
  v_stock       int;
  v_items       jsonb := '[]'::jsonb;
  v_subtotal    numeric := 0;
  v_entrega     text := coalesce(nullif(p_entrega, ''), 'coordinar');
  v_envio       numeric := 0;
  v_cfg         public.configuracion%rowtype;
  v_origen      text := coalesce(nullif(p_origen, ''), 'checkout');
  v_metodo      text := coalesce(nullif(p_metodo_pago, ''), 'coordinar');
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión para hacer un pedido.';
  end if;

  -- La carga manual (origen 'admin') es solo del panel.
  if v_origen = 'admin' and not v_admin then
    v_origen := 'checkout';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tu carrito está vacío.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := (v_item->>'id')::uuid;
    v_variante := nullif(v_item->>'variante_id', '')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 0);
    -- Reset: un SELECT INTO sin filas deja el valor de la vuelta anterior.
    v_var_nombre := null;
    v_nombre := null;

    if v_cantidad <= 0 then
      raise exception 'La cantidad de uno de los productos no es válida.';
    end if;

    -- Producto visible (los ocultos solo los puede vender el admin a mano).
    select nombre, precio into v_nombre, v_precio
      from public.productos
     where id = v_id and (activo or v_admin);
    if v_nombre is null then
      raise exception 'Uno de los productos de tu carrito ya no está disponible.';
    end if;

    if v_variante is not null then
      -- Con variante: se descuenta de la variante (el trigger de la 0015
      -- actualiza el stock total del producto).
      update public.producto_variantes
         set stock = stock - v_cantidad
       where id = v_variante and producto_id = v_id and stock >= v_cantidad
      returning nombre into v_var_nombre;

      if not found then
        select nombre, stock into v_var_nombre, v_stock
          from public.producto_variantes where id = v_variante and producto_id = v_id;
        if v_var_nombre is null then
          raise exception 'Una de las opciones de "%" ya no está disponible.', v_nombre;
        end if;
        raise exception 'De "% — %" nos %. Hay que ajustar la cantidad para continuar.',
          v_nombre, v_var_nombre,
          case when v_stock = 0 then 'no quedan unidades'
               when v_stock = 1 then 'queda 1 unidad'
               else 'quedan ' || v_stock || ' unidades' end;
      end if;
    else
      if exists (select 1 from public.producto_variantes where producto_id = v_id) then
        raise exception 'Falta elegir una opción de "%".', v_nombre;
      end if;

      update public.productos
         set stock = stock - v_cantidad
       where id = v_id and stock >= v_cantidad;

      if not found then
        select stock into v_stock from public.productos where id = v_id;
        raise exception 'De "%" nos %. Hay que ajustar la cantidad para continuar.',
          v_nombre,
          case when v_stock = 0 then 'no quedan unidades'
               when v_stock = 1 then 'queda 1 unidad'
               else 'quedan ' || v_stock || ' unidades' end;
      end if;
    end if;

    v_subtotal := v_subtotal + v_precio * v_cantidad;
    v_items := v_items || jsonb_build_object(
      'id', v_id,
      'nombre', case when v_var_nombre is null then v_nombre else v_nombre || ' — ' || v_var_nombre end,
      'precio', v_precio,
      'cantidad', v_cantidad,
      'variante_id', v_variante,
      'variante', v_var_nombre
    );
  end loop;

  -- Envío: costo fijo de la configuración (null = a coordinar, queda en 0),
  -- gratis si el subtotal alcanza el mínimo configurado.
  if v_entrega = 'envio' then
    select * into v_cfg from public.configuracion where id;
    v_envio := coalesce(v_cfg.envio_costo, 0);
    if v_cfg.envio_gratis_desde is not null and v_subtotal >= v_cfg.envio_gratis_desde then
      v_envio := 0;
    end if;
  end if;

  insert into public.pedidos
    (user_id, nombre, telefono, email, entrega, direccion, localidad, cp, notas,
     items, subtotal, envio, origen, metodo_pago)
  values
    (v_uid, p_nombre, p_telefono, nullif(p_email, ''), v_entrega,
     p_direccion, p_localidad, p_cp, p_notas, v_items, v_subtotal, v_envio,
     v_origen, v_metodo)
  returning numero into v_numero;

  return v_numero;
end;
$$;

revoke execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text, text
) from anon;
grant execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text, text
) to authenticated;

-- ----------------------------------------------------------------------------
-- La clienta NO puede tocar el estado del pago: el update de pedidos ya es
-- solo admin (0005). El webhook usa la service role, que saltea RLS.
-- ----------------------------------------------------------------------------
