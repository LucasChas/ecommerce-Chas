-- ============================================================================
-- INSTALACIÓN COMPLETA (archivo generado con `pnpm sql:instalacion`, no editar)
--
-- Pegá TODO este archivo en Supabase → SQL Editor → New query y ejecutá.
-- Incluye, en orden: 0001_init.sql, 0002_imagenes_multiples.sql, 0003_pedidos.sql, 0004_crear_pedido.sql, 0005_cuentas.sql, 0006_stock_y_precios.sql, 0007_borrar_pedidos.sql, 0008_devolver_stock.sql, 0009_papelera_pedidos.sql, 0010_pedido_eliminado_visible.sql, 0011_slug_productos.sql, 0012_email_pedido.sql, 0013_origen_pedido.sql, 0014_configuracion.sql, 0015_rubros.sql, 0016_envio_y_pagos.sql, 0017_tema.sql, 0018_plataforma.sql
--
-- Después: creá tu usuario en Authentication → Users y corré
--   select public.promover_admin('tu@email.com');
-- ============================================================================


-- >>>>>>>>>>>>>>>>>>>> 0001_init.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración inicial
-- Crea tablas (categorias, productos), políticas RLS, bucket de Storage y
-- la validación de backend que impide borrar categorías con productos.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- (Ver README.md, sección "Migraciones").
-- ============================================================================

-- gen_random_uuid() viene de pgcrypto; en Supabase ya está disponible,
-- pero lo dejamos explícito por las dudas.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Tabla: categorias
-- ----------------------------------------------------------------------------
create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabla: productos
-- La disponibilidad NO es un campo: se calcula como (stock > 0).
-- on delete restrict => la base rechaza borrar una categoría que tenga
-- productos asociados (primera capa de protección en el backend).
-- ----------------------------------------------------------------------------
create table if not exists public.productos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  categoria_id uuid references public.categorias(id) on delete restrict,
  descripcion  text,
  precio       numeric(10,2) not null default 0,
  stock        integer not null default 0,
  imagen_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Índice para filtrar/ordenar por categoría rápido.
create index if not exists productos_categoria_id_idx on public.productos (categoria_id);

-- ----------------------------------------------------------------------------
-- Trigger: mantener updated_at al día en cada UPDATE de productos
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists productos_set_updated_at on public.productos;
create trigger productos_set_updated_at
  before update on public.productos
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger: bloquear el borrado de una categoría que tenga productos.
-- Es redundante con "on delete restrict", pero devuelve un mensaje claro
-- (segunda capa de protección, reforzada en el backend y no en el frontend).
-- ----------------------------------------------------------------------------
create or replace function public.impedir_borrar_categoria_con_productos()
returns trigger
language plpgsql
as $$
declare
  cantidad integer;
begin
  select count(*) into cantidad from public.productos where categoria_id = old.id;
  if cantidad > 0 then
    raise exception 'No se puede eliminar la categoría "%": tiene % producto(s) asociado(s).', old.nombre, cantidad;
  end if;
  return old;
end;
$$;

drop trigger if exists categorias_impedir_borrado on public.categorias;
create trigger categorias_impedir_borrado
  before delete on public.categorias
  for each row execute function public.impedir_borrar_categoria_con_productos();

-- ============================================================================
-- Row Level Security (RLS)
-- Lectura pública (para el catálogo). Escritura solo usuarios autenticados
-- (la administradora logueada).
-- ============================================================================
alter table public.categorias enable row level security;
alter table public.productos  enable row level security;

-- --- categorias ---
drop policy if exists "categorias lectura publica" on public.categorias;
create policy "categorias lectura publica"
  on public.categorias for select
  to anon, authenticated
  using (true);

drop policy if exists "categorias escritura autenticada" on public.categorias;
create policy "categorias escritura autenticada"
  on public.categorias for all
  to authenticated
  using (true)
  with check (true);

-- --- productos ---
drop policy if exists "productos lectura publica" on public.productos;
create policy "productos lectura publica"
  on public.productos for select
  to anon, authenticated
  using (true);

drop policy if exists "productos escritura autenticada" on public.productos;
create policy "productos escritura autenticada"
  on public.productos for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================================
-- Storage: bucket "productos" (público para lectura, escritura autenticada)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

drop policy if exists "productos storage lectura publica" on storage.objects;
create policy "productos storage lectura publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'productos');

drop policy if exists "productos storage insert autenticada" on storage.objects;
create policy "productos storage insert autenticada"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'productos');

drop policy if exists "productos storage update autenticada" on storage.objects;
create policy "productos storage update autenticada"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'productos');

drop policy if exists "productos storage delete autenticada" on storage.objects;
create policy "productos storage delete autenticada"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'productos');

-- ============================================================================
-- Realtime: publicar cambios de ambas tablas para que el catálogo se
-- actualice solo (sin recargar la página).
-- ============================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.productos;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.categorias;
  exception when duplicate_object then null;
  end;
end $$;

-- ============================================================================
-- (Opcional) Datos de ejemplo para probar. Descomentá si querés arrancar
-- con algunas categorías cargadas.
-- ============================================================================
-- insert into public.categorias (nombre) values
--   ('Bodies'), ('Ajuares'), ('Gorros'), ('Enteritos')
-- on conflict (nombre) do nothing;

-- >>>>>>>>>>>>>>>>>>>> 0002_imagenes_multiples.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0002: múltiples imágenes por producto
-- Agrega la columna "imagenes" (array de URLs) para la galería del detalle.
-- Se mantiene "imagen_url" como PORTADA (primera imagen) para la grilla del
-- catálogo y compatibilidad con lo ya cargado.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

-- Array de URLs públicas de Storage. Por defecto vacío.
alter table public.productos
  add column if not exists imagenes text[] not null default '{}';

-- Backfill: los productos que ya tenían una imagen (imagen_url) pasan a tener
-- esa foto como primer (y único) elemento de la galería.
update public.productos
set imagenes = array[imagen_url]
where imagen_url is not null
  and imagen_url <> ''
  and (imagenes is null or imagenes = '{}');

-- >>>>>>>>>>>>>>>>>>>> 0003_pedidos.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0003: pedidos (checkout como invitada)
-- Crea la tabla de pedidos que genera el checkout del catálogo público.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

create table if not exists public.pedidos (
  id         uuid primary key default gen_random_uuid(),
  -- Número de orden corto y legible para hablar por WhatsApp ("pedido #12").
  numero     bigint generated always as identity,
  -- Datos de la clienta (compra como invitada, sin cuenta).
  nombre     text not null,
  telefono   text not null,
  email      text,
  -- Entrega: 'envio' (a domicilio) o 'coordinar' (retiro / a convenir).
  entrega    text not null default 'coordinar' check (entrega in ('envio', 'coordinar')),
  direccion  text,
  localidad  text,
  cp         text,
  notas      text,
  -- Foto de los ítems al momento del pedido: [{id, nombre, precio, cantidad}].
  items      jsonb not null,
  subtotal   numeric(10,2) not null default 0,
  -- Estado del pedido para el seguimiento del admin.
  estado     text not null default 'nuevo'
             check (estado in ('nuevo', 'confirmado', 'entregado', 'cancelado')),
  created_at timestamptz not null default now()
);

create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);

-- ----------------------------------------------------------------------------
-- RLS: cualquiera puede CREAR un pedido (checkout público, sin login),
-- pero solo la administradora autenticada puede verlos y gestionarlos.
-- ----------------------------------------------------------------------------
alter table public.pedidos enable row level security;

drop policy if exists "pedidos insert publico" on public.pedidos;
create policy "pedidos insert publico"
  on public.pedidos for insert
  to anon, authenticated
  with check (true);

drop policy if exists "pedidos lectura autenticada" on public.pedidos;
create policy "pedidos lectura autenticada"
  on public.pedidos for select
  to authenticated
  using (true);

drop policy if exists "pedidos gestion autenticada" on public.pedidos;
create policy "pedidos gestion autenticada"
  on public.pedidos for update
  to authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- Realtime: publicar la tabla para que el panel de pedidos se actualice solo
-- cuando entra un pedido nuevo o cambia un estado.
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.pedidos;
  exception when duplicate_object then null;
  end;
end $$;

-- >>>>>>>>>>>>>>>>>>>> 0004_crear_pedido.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0004: función para crear pedidos (checkout público)
--
-- Por qué: el checkout necesita INSERTAR el pedido Y recibir de vuelta el número
-- de orden. Pero la lectura de "pedidos" es solo para la admin (RLS). Si el alta
-- intenta devolver la fila (insert ... returning), RLS la bloquea para la clienta.
--
-- Solución: una función SECURITY DEFINER que corre con permisos del dueño (saltea
-- RLS solo para esta operación controlada): inserta el pedido y devuelve el número.
-- Así la clienta obtiene su número de orden SIN poder leer los demás pedidos.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

create or replace function public.crear_pedido(
  p_nombre    text,
  p_telefono  text,
  p_email     text,
  p_entrega   text,
  p_direccion text,
  p_localidad text,
  p_cp        text,
  p_notas     text,
  p_items     jsonb,
  p_subtotal  numeric
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero bigint;
begin
  insert into public.pedidos
    (nombre, telefono, email, entrega, direccion, localidad, cp, notas, items, subtotal)
  values
    (p_nombre, p_telefono, nullif(p_email, ''),
     coalesce(nullif(p_entrega, ''), 'coordinar'),
     p_direccion, p_localidad, p_cp, p_notas, p_items, coalesce(p_subtotal, 0))
  returning numero into v_numero;
  return v_numero;
end;
$$;

-- Cualquiera (clienta anónima o admin) puede LLAMAR a la función.
grant execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric
) to anon, authenticated;

-- >>>>>>>>>>>>>>>>>>>> 0005_cuentas.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0005: cuentas de clientas + roles + seguridad
--
-- Introduce cuentas de clientas (Supabase Auth) y separa permisos:
--   - "cliente": puede crear pedidos y ver SOLO los suyos.
--   - "admin"  : gestiona productos/categorías/estados y ve TODOS los pedidos.
--
-- IMPORTANTE (pasos en el dashboard, aparte de este SQL):
--   1) Authentication → Providers → Email: activá "Enable Sign up".
--      (Opcional recomendado: desactivá "Confirm email" para que la clienta
--       pueda entrar apenas se registra, sin verificar mail.)
--   2) Este script marca como admin a la cuenta de abajo. CAMBIÁ el email si tu
--      cuenta de administradora es otra.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Perfiles (1 por usuario de auth) con rol.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text,
  telefono   text,
  rol        text not null default 'cliente' check (rol in ('cliente', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "perfil propio select" on public.profiles;
create policy "perfil propio select"
  on public.profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "perfil propio update" on public.profiles;
create policy "perfil propio update"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Crea el perfil automáticamente cuando se registra un usuario nuevo.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre, telefono)
  values (new.id, new.raw_user_meta_data->>'nombre', new.raw_user_meta_data->>'telefono')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ¿El usuario actual es admin? (se usa en las políticas RLS)
create or replace function public.es_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin');
$$;

-- El admin NO se marca acá: después de instalar, creá el usuario en
-- Authentication → Users y corré  select public.promover_admin('email@...');
-- (función de la migración 0014).

-- ----------------------------------------------------------------------------
-- Pedidos: se ligan a la cuenta de la clienta.
-- ----------------------------------------------------------------------------
alter table public.pedidos
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists pedidos_user_id_idx on public.pedidos (user_id);

-- Recreamos crear_pedido: ahora EXIGE estar logueada y guarda el user_id.
create or replace function public.crear_pedido(
  p_nombre    text,
  p_telefono  text,
  p_email     text,
  p_entrega   text,
  p_direccion text,
  p_localidad text,
  p_cp        text,
  p_notas     text,
  p_items     jsonb,
  p_subtotal  numeric
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero bigint;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión para hacer un pedido.';
  end if;
  insert into public.pedidos
    (user_id, nombre, telefono, email, entrega, direccion, localidad, cp, notas, items, subtotal)
  values
    (v_uid, p_nombre, p_telefono, nullif(p_email, ''),
     coalesce(nullif(p_entrega, ''), 'coordinar'),
     p_direccion, p_localidad, p_cp, p_notas, p_items, coalesce(p_subtotal, 0))
  returning numero into v_numero;
  return v_numero;
end;
$$;

-- Ahora solo usuarios logueados pueden crear pedidos (ya no anónimos).
revoke execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric
) from anon;
grant execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric
) to authenticated;

-- RLS de pedidos: la clienta ve/gestiona SOLO los suyos; la admin, todos.
drop policy if exists "pedidos insert publico" on public.pedidos;
drop policy if exists "pedidos lectura autenticada" on public.pedidos;
drop policy if exists "pedidos gestion autenticada" on public.pedidos;

drop policy if exists "pedidos select propio o admin" on public.pedidos;
create policy "pedidos select propio o admin"
  on public.pedidos for select to authenticated
  using (user_id = auth.uid() or public.es_admin());

-- Solo la admin cambia el estado del pedido.
drop policy if exists "pedidos update admin" on public.pedidos;
create policy "pedidos update admin"
  on public.pedidos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- Escritura de productos y categorías: SOLO admin (antes era cualquier auth).
-- ----------------------------------------------------------------------------
drop policy if exists "productos escritura autenticada" on public.productos;
drop policy if exists "productos escritura admin" on public.productos;
create policy "productos escritura admin"
  on public.productos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "categorias escritura autenticada" on public.categorias;
drop policy if exists "categorias escritura admin" on public.categorias;
create policy "categorias escritura admin"
  on public.categorias for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- Storage (bucket productos): subir/editar/borrar imágenes, SOLO admin.
-- ----------------------------------------------------------------------------
drop policy if exists "productos storage insert autenticada" on storage.objects;
drop policy if exists "productos storage insert admin" on storage.objects;
create policy "productos storage insert admin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'productos' and public.es_admin());

drop policy if exists "productos storage update autenticada" on storage.objects;
drop policy if exists "productos storage update admin" on storage.objects;
create policy "productos storage update admin"
  on storage.objects for update to authenticated
  using (bucket_id = 'productos' and public.es_admin());

drop policy if exists "productos storage delete autenticada" on storage.objects;
drop policy if exists "productos storage delete admin" on storage.objects;
create policy "productos storage delete admin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'productos' and public.es_admin());

-- >>>>>>>>>>>>>>>>>>>> 0006_stock_y_precios.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0006: el pedido descuenta stock y se arma con los precios
-- de la base.
--
-- Por qué:
--   1) Hasta ahora crear_pedido registraba el pedido pero NO tocaba el stock.
--      Con 3 unidades se podían vender 3 veces 3: la disponibilidad del
--      muestrario (stock > 0) mentía y había que descontar a mano en el panel.
--   2) El precio y el subtotal llegaban tal cual desde el navegador. Con la anon
--      key (que es pública por diseño) cualquiera podía registrar un pedido de $1.
--      Hoy lo salva que la admin cobra por WhatsApp, pero con MercadoPago sería
--      un agujero de cobro.
--
-- La función sigue siendo SECURITY DEFINER: corre con permisos del dueño, así que
-- puede tocar productos aunque la escritura esté reservada a la admin (RLS).
-- Todo pasa dentro de una transacción: si un ítem falla, se deshace el pedido
-- entero y los descuentos de los ítems anteriores.
--
-- La firma NO cambia (mismos parámetros), así que el front sigue funcionando sin
-- tocar nada. p_precio de cada ítem y p_subtotal ahora se IGNORAN: son datos del
-- cliente y no se pueden confiar.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

create or replace function public.crear_pedido(
  p_nombre    text,
  p_telefono  text,
  p_email     text,
  p_entrega   text,
  p_direccion text,
  p_localidad text,
  p_cp        text,
  p_notas     text,
  p_items     jsonb,
  p_subtotal  numeric
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero   bigint;
  v_uid      uuid := auth.uid();
  v_item     jsonb;
  v_id       uuid;
  v_cantidad int;
  v_nombre   text;
  v_precio   numeric;
  v_stock    int;
  -- Ítems reconstruidos con los datos de la base (no los que mandó el navegador).
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión para hacer un pedido.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tu carrito está vacío.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := (v_item->>'id')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 0);

    if v_cantidad <= 0 then
      raise exception 'La cantidad de uno de los productos no es válida.';
    end if;

    -- Descontamos el stock y leemos el precio vigente en UNA sola operación.
    -- El "and stock >= v_cantidad" es la protección contra dos clientas
    -- comprando la última unidad al mismo tiempo: la segunda no matchea ninguna
    -- fila y el pedido se corta entero.
    update public.productos
       set stock = stock - v_cantidad
     where id = v_id
       and stock >= v_cantidad
    returning nombre, precio into v_nombre, v_precio;

    if not found then
      -- No se pudo descontar: o el producto ya no existe, o no alcanza el stock.
      select nombre, stock into v_nombre, v_stock
        from public.productos where id = v_id;
      if v_nombre is null then
        raise exception 'Uno de los productos de tu carrito ya no está disponible.';
      end if;
      raise exception 'De "%" nos %. Ajustá la cantidad y volvé a intentar.',
        v_nombre,
        case when v_stock = 1 then 'queda 1 unidad'
             else 'quedan ' || v_stock || ' unidades' end;
    end if;

    v_subtotal := v_subtotal + v_precio * v_cantidad;
    v_items := v_items || jsonb_build_object(
      'id', v_id, 'nombre', v_nombre, 'precio', v_precio, 'cantidad', v_cantidad
    );
  end loop;

  insert into public.pedidos
    (user_id, nombre, telefono, email, entrega, direccion, localidad, cp, notas, items, subtotal)
  values
    (v_uid, p_nombre, p_telefono, nullif(p_email, ''),
     coalesce(nullif(p_entrega, ''), 'coordinar'),
     p_direccion, p_localidad, p_cp, p_notas, v_items, v_subtotal)
  returning numero into v_numero;

  return v_numero;
end;
$$;

-- Los permisos no cambian, pero los repetimos para que la migración sea
-- idempotente y se pueda re-correr sin dejar la función accesible a anónimos.
revoke execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric
) from anon;
grant execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric
) to authenticated;

-- ----------------------------------------------------------------------------
-- Red de seguridad: que el stock no pueda quedar negativo por ningún camino
-- (ni por la edición inline del panel).
-- ----------------------------------------------------------------------------
do $$
begin
  alter table public.productos add constraint productos_stock_no_negativo check (stock >= 0);
exception when duplicate_object then null;
end $$;

-- >>>>>>>>>>>>>>>>>>>> 0007_borrar_pedidos.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0007: la administradora puede borrar pedidos
--
-- Por qué: hasta ahora un pedido solo podía pasar a "cancelado". No había forma
-- de eliminar los de prueba desde el panel (la tabla no tenía policy de DELETE),
-- y la administradora no usa computadora: no puede ir al SQL Editor.
--
-- Solo admin. Las clientas no pueden borrar sus pedidos: si se arrepienten,
-- se cancela (queda el registro de lo que pasó).
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

drop policy if exists "pedidos delete admin" on public.pedidos;
create policy "pedidos delete admin"
  on public.pedidos for delete to authenticated
  using (public.es_admin());

-- Índices para que el filtrado y la búsqueda del panel no degraden cuando la
-- tabla crezca (el panel filtra por estado y busca por número).
create index if not exists pedidos_estado_idx on public.pedidos (estado);
create index if not exists pedidos_numero_idx on public.pedidos (numero);

-- >>>>>>>>>>>>>>>>>>>> 0008_devolver_stock.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0008: cancelar o borrar un pedido devuelve el stock
--
-- Por qué: desde la 0006 el pedido descuenta stock al crearse, pero nada lo
-- reponía. Si un pedido se cancelaba o se borraba, esas unidades quedaban
-- descontadas para siempre: la prenda estaba en el cajón pero el muestrario la
-- mostraba como "sin stock".
--
-- Lo resolvemos con triggers y no en el front, para que valga por cualquier
-- camino (panel, SQL Editor, o el futuro webhook de MercadoPago).
--
-- Reglas:
--   * pasa a 'cancelado'        -> devuelve el stock
--   * sale de 'cancelado'       -> lo vuelve a descontar (si no alcanza, falla)
--   * se borra un pedido activo -> devuelve el stock
--   * se borra uno ya cancelado -> no toca nada (ya se había devuelto)
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

-- Suma (signo +1) o resta (signo -1) al stock las cantidades de un pedido.
-- Agrupa por producto: si el mismo ítem aparece repetido en el jsonb, se suman
-- las cantidades en vez de perderse una.
create or replace function public.ajustar_stock_pedido(p_items jsonb, p_signo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_items is null then return; end if;

  update public.productos p
     set stock = p.stock + p_signo * i.cantidad
    from (
      select (value->>'id')::uuid as id,
             sum((value->>'cantidad')::int) as cantidad
        from jsonb_array_elements(p_items)
       group by 1
    ) i
   where p.id = i.id;
end;
$$;

-- Reacciona a los cambios de estado del pedido.
create or replace function public.pedido_estado_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if new.estado = 'cancelado' then
    -- Se cancela: la mercadería vuelve a estar disponible.
    perform public.ajustar_stock_pedido(new.items, 1);

  elsif old.estado = 'cancelado' then
    -- Se reactiva un pedido cancelado: hay que volver a reservar la mercadería.
    -- Si no hay stock, el check (stock >= 0) de la 0006 corta la operación.
    begin
      perform public.ajustar_stock_pedido(new.items, -1);
    exception when check_violation then
      raise exception 'No hay stock suficiente para reactivar el pedido #%.', new.numero;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists pedidos_estado_stock on public.pedidos;
create trigger pedidos_estado_stock
  after update of estado on public.pedidos
  for each row execute function public.pedido_estado_stock();

-- Al borrar, devolvemos el stock salvo que el pedido ya estuviera cancelado
-- (en ese caso el trigger de arriba ya lo había repuesto).
create or replace function public.pedido_borrado_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.estado <> 'cancelado' then
    perform public.ajustar_stock_pedido(old.items, 1);
  end if;
  return old;
end;
$$;

drop trigger if exists pedidos_borrado_stock on public.pedidos;
create trigger pedidos_borrado_stock
  after delete on public.pedidos
  for each row execute function public.pedido_borrado_stock();

-- >>>>>>>>>>>>>>>>>>>> 0009_papelera_pedidos.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0009: papelera de pedidos (borrar y reflotar)
--
-- Por qué: borrar un pedido era definitivo. Ahora "borrar" lo manda a la
-- papelera (queda oculto pero recuperable) y desde ahí se puede restaurar o
-- eliminar para siempre.
--
-- Además unifica la lógica de stock de la 0008. Antes había dos reglas sueltas
-- (cambio de estado / borrado); ahora hay UNA sola idea:
--
--     un pedido "reserva" mercadería si NO está cancelado y NO está en la papelera
--
-- Cada vez que esa condición cambia, el stock se ajusta en consecuencia. Así
-- quedan cubiertos todos los casos sin contar dos veces: cancelar, descancelar,
-- mandar a la papelera, restaurar y eliminar definitivamente.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

alter table public.pedidos
  add column if not exists eliminado_at timestamptz;

-- El panel filtra por papelera en casi todas las consultas.
create index if not exists pedidos_eliminado_at_idx on public.pedidos (eliminado_at);

-- ¿Este pedido tiene mercadería reservada (descontada del stock)?
create or replace function public.pedido_reserva_stock(p_estado text, p_eliminado timestamptz)
returns boolean language sql immutable as $$
  select p_estado <> 'cancelado' and p_eliminado is null;
$$;

-- Ajusta el stock cuando cambia si el pedido reserva mercadería o no.
create or replace function public.pedido_estado_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antes  boolean := public.pedido_reserva_stock(old.estado, old.eliminado_at);
  v_ahora  boolean := public.pedido_reserva_stock(new.estado, new.eliminado_at);
begin
  if v_antes = v_ahora then
    return new;
  end if;

  if v_antes and not v_ahora then
    -- Deja de reservar (se canceló o fue a la papelera): vuelve al stock.
    perform public.ajustar_stock_pedido(new.items, 1);
  else
    -- Vuelve a reservar (se restauró o se descanceló): hay que descontar otra vez.
    begin
      perform public.ajustar_stock_pedido(new.items, -1);
    exception when check_violation then
      raise exception 'No hay stock suficiente para reactivar el pedido #%.', new.numero;
    end;
  end if;

  return new;
end;
$$;

-- Ahora escuchamos cualquier update (no solo el de "estado"), porque mandar a la
-- papelera y restaurar también cambian la reserva.
drop trigger if exists pedidos_estado_stock on public.pedidos;
create trigger pedidos_estado_stock
  after update on public.pedidos
  for each row execute function public.pedido_estado_stock();

-- Borrado definitivo: solo devuelve stock si el pedido todavía lo reservaba
-- (si estaba en la papelera o cancelado, ya se había devuelto).
create or replace function public.pedido_borrado_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.pedido_reserva_stock(old.estado, old.eliminado_at) then
    perform public.ajustar_stock_pedido(old.items, 1);
  end if;
  return old;
end;
$$;

drop trigger if exists pedidos_borrado_stock on public.pedidos;
create trigger pedidos_borrado_stock
  after delete on public.pedidos
  for each row execute function public.pedido_borrado_stock();

-- La clienta no debe ver en "Mis pedidos" los que la admin mandó a la papelera.
drop policy if exists "pedidos select propio o admin" on public.pedidos;
create policy "pedidos select propio o admin"
  on public.pedidos for select to authenticated
  using ((user_id = auth.uid() and eliminado_at is null) or public.es_admin());

-- >>>>>>>>>>>>>>>>>>>> 0010_pedido_eliminado_visible.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0010: la clienta ve sus pedidos eliminados como cancelados
--
-- La 0009 le ocultaba a la clienta los pedidos que la admin mandaba a la
-- papelera. Eso era peor: el pedido desaparecía sin explicación y la clienta no
-- tenía a qué agarrarse para preguntar qué pasó.
--
-- Ahora los sigue viendo (el front los muestra como "Cancelado", ver
-- MyOrdersPage) y desde ahí puede escribir por WhatsApp para consultar el motivo.
-- La papelera vuelve a ser lo que dice ser: una vista del panel, no un borrado
-- silencioso a espaldas de la clienta.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- ============================================================================

drop policy if exists "pedidos select propio o admin" on public.pedidos;
create policy "pedidos select propio o admin"
  on public.pedidos for select to authenticated
  using (user_id = auth.uid() or public.es_admin());

-- >>>>>>>>>>>>>>>>>>>> 0011_slug_productos.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0011: slugs únicos para los productos
--
-- Por qué: /producto/:id mostraba links feos e ilegibles (un uuid). Ahora cada
-- producto tiene un "slug" (ej: "body-manga-larga") generado a partir del
-- nombre, y /producto/:param acepta tanto el slug nuevo como el uuid viejo
-- (así los links ya compartidos siguen funcionando).
--
-- La app NUNCA calcula el slug: lo hace siempre la base, en un trigger, así no
-- hay dos implementaciones (TS + SQL) que puedan desincronizarse ni carreras
-- de unicidad desde el cliente.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- Es idempotente: se puede volver a correr sin romper nada.
-- ============================================================================

alter table public.productos add column if not exists slug text;
create unique index if not exists productos_slug_key on public.productos (slug);

-- Normaliza un texto a slug: minúsculas, sin acentos (translate, no hace falta
-- la extensión "unaccent"), y cualquier corrida de caracteres que no sean
-- letras/números se colapsa a un solo guion. "" si no queda nada usable.
create or replace function public.slugify(txt text)
returns text language sql immutable as $$
  select nullif(
    trim(both '-' from regexp_replace(
      translate(
        lower(coalesce(txt, '')),
        'áéíóúñüàèìòùâêîôûäëïöü',
        'aeiounuaeiouaeiouaeiou'
      ),
      '[^a-z0-9]+', '-', 'g'
    )),
    ''
  );
$$;

-- Slug único para un producto: arranca en slugify(txt) (o "producto" si el
-- nombre no deja nada usable) y si ya existe en otro producto, va probando
-- sufijos numéricos -2, -3, -4... hasta encontrar uno libre.
create or replace function public.slug_unico(txt text, self uuid)
returns text language plpgsql as $$
declare
  base text := coalesce(public.slugify(txt), 'producto');
  candidato text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.productos
    where slug = candidato and id <> self
  ) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;
  return candidato;
end;
$$;

-- Antes de insertar o de renombrar un producto, le asigna/recalcula el slug.
create or replace function public.productos_set_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or (tg_op = 'UPDATE' and new.nombre is distinct from old.nombre) then
    new.slug := public.slug_unico(new.nombre, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists productos_slug on public.productos;
create trigger productos_slug
  before insert or update of nombre on public.productos
  for each row execute function public.productos_set_slug();

-- Backfill: le genera slug a los productos que todavía no tienen. Se procesan
-- en orden de creación para que, ante nombres duplicados, el producto más
-- viejo se quede con el slug "limpio" (sin sufijo) y el más nuevo reciba -2, -3...
do $$
declare
  r record;
begin
  for r in
    select id, nombre from public.productos
    where slug is null
    order by created_at asc
  loop
    update public.productos
    set slug = public.slug_unico(nombre, id)
    where id = r.id;
  end loop;
end $$;

-- >>>>>>>>>>>>>>>>>>>> 0012_email_pedido.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0012: email de confirmación de pedido
--
-- Por qué: cuando se crea un pedido (crear_pedido()), nadie le manda a la
-- clienta un comprobante por mail con el detalle de lo que compró. Este
-- trigger dispara una llamada HTTP asíncrona (pg_net) a una Edge Function
-- que arma y envía ese mail (actualmente vía la API de Gmail).
--
-- "Fire-and-forget" real: la llamada usa net.http_post (asíncrono, no espera
-- respuesta) y TODO el cuerpo del trigger está envuelto en
-- "exception when others then null", así que ni una falla de pg_net ni un
-- error de red pueden abortar el insert en pedidos. El pedido siempre se
-- crea; en el peor caso, el mail simplemente no sale (y queda logueado del
-- lado de la Edge Function).
--
-- IMPORTANTE — pasos manuales en el SQL Editor (esta migración NO los hace,
-- a propósito: los valores son secretos y no van al repo):
--
--   1) Guardá la URL de la Edge Function y un token de autorización en Vault.
--      Reemplazá los placeholders por los valores reales y corré esto UNA
--      sola vez (ejecutar de nuevo con el mismo nombre da error de secreto
--      duplicado; para rotar un valor usá vault.update_secret en su lugar):
--
--        select vault.create_secret(
--          'https://<tu-proyecto>.supabase.co/functions/v1/enviar-recibo-pedido',
--          'tienda_email_function_url'
--        );
--        select vault.create_secret(
--          '<tu-service-role-key>',
--          'tienda_email_function_token'
--        );
--
--      El token recomendado es la service-role key del proyecto: la Edge
--      Function se despliega con verificación JWT default (ver
--      supabase/functions/README.md) y espera ese valor como Bearer.
--
--   2) Desplegá la función ANTES de correr esta migración (ver el runbook en
--      supabase/functions/README.md). Si el trigger llega a activarse antes
--      de que la función exista, pg_net simplemente recibe un 404: no rompe
--      nada, pero ensucia los logs.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y
-- ejecutá. Es idempotente: se puede volver a correr sin romper nada (salvo
-- por el paso manual de Vault de arriba, que es aparte y una sola vez).
-- ============================================================================

-- pg_net: permite hacer HTTP requests asíncronos desde Postgres.
create extension if not exists pg_net with schema extensions;

-- ----------------------------------------------------------------------------
-- Función del trigger: arma el body y dispara la llamada a la Edge Function.
-- SECURITY DEFINER porque necesita leer extensions.pg_net y vault.decrypted_secrets,
-- a los que un usuario común no tiene acceso.
-- ----------------------------------------------------------------------------
create or replace function public.pedido_creado_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url   text;
  v_token text;
begin
  begin
    select decrypted_secret into v_url
      from vault.decrypted_secrets
     where name = 'tienda_email_function_url';

    select decrypted_secret into v_token
      from vault.decrypted_secrets
     where name = 'tienda_email_function_token';

    -- Si todavía no se cargaron los secretos en Vault (deploy en progreso,
    -- entorno recién levantado, etc.), no hay nada para llamar: salimos
    -- silenciosamente en vez de fallar.
    if v_url is null or v_token is null then
      return new;
    end if;

    -- net.http_post es asíncrono: encola la request y devuelve al toque,
    -- sin bloquear el insert en pedidos.
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_token
      ),
      body := jsonb_build_object('pedido_id', new.id)
    );
  exception when others then
    -- Cualquier falla acá (red, Vault, pg_net) NUNCA debe tumbar el pedido.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists pedido_creado_email on public.pedidos;
create trigger pedido_creado_email
  after insert on public.pedidos
  for each row execute function public.pedido_creado_email();

-- >>>>>>>>>>>>>>>>>>>> 0013_origen_pedido.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0013: origen del pedido (checkout de la clienta vs. carga
-- manual de la admin cuando el pedido llega por WhatsApp).
-- ============================================================================

alter table public.pedidos add column if not exists origen text not null default 'checkout';

do $$
begin
  alter table public.pedidos add constraint pedidos_origen_valido check (origen in ('checkout', 'admin'));
exception when duplicate_object then null;
end $$;

drop function if exists public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric
);

create or replace function public.crear_pedido(
  p_nombre    text,
  p_telefono  text,
  p_email     text,
  p_entrega   text,
  p_direccion text,
  p_localidad text,
  p_cp        text,
  p_notas     text,
  p_items     jsonb,
  p_subtotal  numeric,
  p_origen    text default 'checkout'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero   bigint;
  v_uid      uuid := auth.uid();
  v_item     jsonb;
  v_id       uuid;
  v_cantidad int;
  v_nombre   text;
  v_precio   numeric;
  v_stock    int;
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión para hacer un pedido.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Tu carrito está vacío.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := (v_item->>'id')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 0);

    if v_cantidad <= 0 then
      raise exception 'La cantidad de uno de los productos no es válida.';
    end if;

    update public.productos
       set stock = stock - v_cantidad
     where id = v_id
       and stock >= v_cantidad
    returning nombre, precio into v_nombre, v_precio;

    if not found then
      select nombre, stock into v_nombre, v_stock
        from public.productos where id = v_id;
      if v_nombre is null then
        raise exception 'Uno de los productos de tu carrito ya no está disponible.';
      end if;
      raise exception 'De "%" nos %. Ajustá la cantidad y volvé a intentar.',
        v_nombre,
        case when v_stock = 1 then 'queda 1 unidad'
             else 'quedan ' || v_stock || ' unidades' end;
    end if;

    v_subtotal := v_subtotal + v_precio * v_cantidad;
    v_items := v_items || jsonb_build_object(
      'id', v_id, 'nombre', v_nombre, 'precio', v_precio, 'cantidad', v_cantidad
    );
  end loop;

  insert into public.pedidos
    (user_id, nombre, telefono, email, entrega, direccion, localidad, cp, notas, items, subtotal, origen)
  values
    (v_uid, p_nombre, p_telefono, nullif(p_email, ''),
     coalesce(nullif(p_entrega, ''), 'coordinar'),
     p_direccion, p_localidad, p_cp, p_notas, v_items, v_subtotal,
     coalesce(nullif(p_origen, ''), 'checkout'))
  returning numero into v_numero;

  return v_numero;
end;
$$;

revoke execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text
) from anon;
grant execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text
) to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 0014_configuracion.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0014: configuración de la tienda + alta de administradores
--
-- Por qué: para que la maqueta sirva a cualquier tienda, lo que la dueña
-- quiere cambiar seguido (nombre, logo, colores, contacto) vive en la base y
-- se edita desde el admin (pestaña "Mi tienda"), sin redeployar.
-- El front combina esta fila con tienda/tienda.config.mjs: cada campo de la
-- tabla, si tiene valor, pisa al del archivo. Si un campo queda en null, se
-- usa el del archivo.
--
-- También agrega promover_admin(email) para dar acceso al panel sin tener que
-- escribir un update a mano (y sin emails de nadie hardcodeados en el repo).
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y
-- ejecutá. Es idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla singleton: una sola fila (id = true).
-- ----------------------------------------------------------------------------
create table if not exists public.configuracion (
  id              boolean primary key default true check (id),
  nombre_tienda   text,
  eslogan         text,
  logo_url        text,
  url_sitio       text,
  color_primario  text check (color_primario ~* '^#[0-9a-f]{6}$'),
  color_fondo     text check (color_fondo    ~* '^#[0-9a-f]{6}$'),
  color_texto     text check (color_texto    ~* '^#[0-9a-f]{6}$'),
  whatsapp        text check (whatsapp ~ '^[0-9]{8,15}$'),
  instagram       text,
  email_contacto  text,
  updated_at      timestamptz not null default now()
);

-- La fila existe desde el principio (todo en null = usar tienda.config.mjs),
-- así el admin siempre hace update y nunca tiene que decidir entre insert/update.
insert into public.configuracion (id) values (true) on conflict (id) do nothing;

drop trigger if exists configuracion_updated_at on public.configuracion;
create trigger configuracion_updated_at
  before update on public.configuracion
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: lectura pública (el catálogo la necesita sin login), escritura admin.
-- No hay policy de insert ni delete: la fila única ya existe y no se borra.
-- ----------------------------------------------------------------------------
alter table public.configuracion enable row level security;

drop policy if exists "configuracion lectura publica" on public.configuracion;
create policy "configuracion lectura publica"
  on public.configuracion for select
  using (true);

drop policy if exists "configuracion update admin" on public.configuracion;
create policy "configuracion update admin"
  on public.configuracion for update
  using (public.es_admin())
  with check (public.es_admin());

-- ----------------------------------------------------------------------------
-- promover_admin(email): da rol admin a una cuenta ya registrada.
--
-- Solo se puede ejecutar desde el SQL Editor / service role: se le revoca el
-- permiso a anon y authenticated, así nadie se autopromueve desde el front.
-- Devuelve true si encontró la cuenta.
-- ----------------------------------------------------------------------------
create or replace function public.promover_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return false;
  end if;

  insert into public.profiles (id, rol)
  values (v_id, 'admin')
  on conflict (id) do update set rol = 'admin';
  return true;
end;
$$;

revoke all on function public.promover_admin(text) from public, anon, authenticated;

-- >>>>>>>>>>>>>>>>>>>> 0015_rubros.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0015: productos para cualquier rubro
--
--   1) productos.activo    → ocultar un producto del catálogo sin borrarlo.
--   2) productos.orden     → orden manual del catálogo (arrastrar en el admin).
--   3) productos.atributos → datos propios del rubro (Material, Medidas...),
--                            definidos por tienda en tienda.config.mjs.
--   4) producto_variantes  → opciones con stock propio (Talle, Color...).
--
-- Variantes y stock — la idea central:
--   Si un producto tiene variantes, su columna "stock" pasa a ser la SUMA del
--   stock de sus variantes y la mantiene un trigger. Así todo lo que ya usa
--   "stock > 0" para saber si hay disponibilidad (catálogo, badges, admin)
--   sigue funcionando sin cambios. Para evitar que se desincronice, un
--   producto con variantes no acepta cambios directos de stock: se edita el
--   de cada variante.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y
-- ejecutá. Es idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1-3) Columnas nuevas de productos
-- ----------------------------------------------------------------------------
alter table public.productos add column if not exists activo boolean not null default true;
alter table public.productos add column if not exists orden int not null default 0;
alter table public.productos add column if not exists atributos jsonb not null default '{}'::jsonb;

create index if not exists productos_activo_orden_idx on public.productos (activo, orden);

-- El catálogo público solo ve productos activos; el admin ve todos.
drop policy if exists "productos lectura publica" on public.productos;
create policy "productos lectura publica"
  on public.productos for select
  to anon, authenticated
  using (activo or public.es_admin());

-- Reordenar el catálogo en una sola llamada (el admin manda los ids en orden).
create or replace function public.ordenar_productos(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el admin puede ordenar productos.';
  end if;
  update public.productos p
     set orden = o.pos
    from unnest(p_ids) with ordinality as o(id, pos)
   where p.id = o.id;
end;
$$;
revoke execute on function public.ordenar_productos(uuid[]) from anon;
grant execute on function public.ordenar_productos(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) Variantes
-- ----------------------------------------------------------------------------
create table if not exists public.producto_variantes (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  stock       int  not null default 0 check (stock >= 0),
  orden       int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (producto_id, nombre)
);

create index if not exists producto_variantes_producto_idx
  on public.producto_variantes (producto_id, orden);

alter table public.producto_variantes enable row level security;

drop policy if exists "variantes lectura publica" on public.producto_variantes;
create policy "variantes lectura publica"
  on public.producto_variantes for select
  to anon, authenticated
  using (true);

drop policy if exists "variantes escritura admin" on public.producto_variantes;
create policy "variantes escritura admin"
  on public.producto_variantes for all
  to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Realtime: el catálogo se entera al instante de cambios de stock por variante.
do $$
begin
  alter publication supabase_realtime add table public.producto_variantes;
exception when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- Stock del producto = suma de sus variantes (mantenido por trigger)
-- ----------------------------------------------------------------------------
create or replace function public.sincronizar_stock_producto(p_producto uuid, p_borrado boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_total int;
begin
  select sum(stock) into v_total from public.producto_variantes where producto_id = p_producto;
  -- Si se borró la última variante, el producto queda en 0 (la admin carga
  -- el stock a mano de nuevo). Si nunca tuvo variantes, no se toca.
  if v_total is null and not p_borrado then
    return;
  end if;

  -- Bandera de la transacción: le avisa al guardián de abajo que este cambio
  -- de stock es legítimo (viene de las variantes).
  perform set_config('app.sincronizando_stock', 'si', true);
  update public.productos set stock = coalesce(v_total, 0) where id = p_producto;
  perform set_config('app.sincronizando_stock', '', true);
end;
$$;

create or replace function public.variantes_sincronizar_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.sincronizar_stock_producto(old.producto_id, tg_op = 'DELETE');
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.producto_id <> old.producto_id or new.stock <> old.stock) then
    perform public.sincronizar_stock_producto(new.producto_id, false);
  end if;
  return null;
end;
$$;

drop trigger if exists variantes_sincronizar_stock on public.producto_variantes;
create trigger variantes_sincronizar_stock
  after insert or update or delete on public.producto_variantes
  for each row execute function public.variantes_sincronizar_stock();

-- Guardián: un producto con variantes no acepta cambios directos de stock.
create or replace function public.productos_guardar_stock_variantes()
returns trigger language plpgsql as $$
begin
  if new.stock is distinct from old.stock
     and coalesce(current_setting('app.sincronizando_stock', true), '') <> 'si'
     and exists (select 1 from public.producto_variantes where producto_id = new.id) then
    raise exception 'Este producto tiene variantes: editá el stock de cada una.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists productos_guardar_stock_variantes on public.productos;
create trigger productos_guardar_stock_variantes
  before update of stock on public.productos
  for each row execute function public.productos_guardar_stock_variantes();

-- ----------------------------------------------------------------------------
-- Devolver / volver a descontar stock de un pedido (reemplaza la de la 0008):
-- ahora cada ítem puede traer "variante_id". Si lo trae, se ajusta la
-- variante (y el trigger actualiza el producto); si no, el producto.
-- ----------------------------------------------------------------------------
create or replace function public.ajustar_stock_pedido(p_items jsonb, p_signo int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_items is null then return; end if;

  update public.producto_variantes v
     set stock = v.stock + p_signo * i.cantidad
    from (
      select nullif(value->>'variante_id', '')::uuid as id,
             sum((value->>'cantidad')::int) as cantidad
        from jsonb_array_elements(p_items)
       where nullif(value->>'variante_id', '') is not null
       group by 1
    ) i
   where v.id = i.id;

  update public.productos p
     set stock = p.stock + p_signo * i.cantidad
    from (
      select (value->>'id')::uuid as id,
             sum((value->>'cantidad')::int) as cantidad
        from jsonb_array_elements(p_items)
       where nullif(value->>'variante_id', '') is null
       group by 1
    ) i
   where p.id = i.id;
end;
$$;

-- >>>>>>>>>>>>>>>>>>>> 0016_envio_y_pagos.sql <<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>> 0017_tema.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0017: tema visual editable desde el admin
--
-- Suma a "configuracion" el preset de tema (paleta + tipografías + forma) y
-- el ornamento del header, para que la dueña los elija en "Mi tienda".
-- null = lo que diga tienda/tienda.config.mjs.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y
-- ejecutá. Es idempotente.
-- ============================================================================

alter table public.configuracion add column if not exists tema_preset text
  check (tema_preset in ('calido', 'minimal', 'oscuro', 'vibrante'));
alter table public.configuracion add column if not exists ornamento text
  check (ornamento in ('festón', 'onda', 'línea', 'ninguno'));

-- >>>>>>>>>>>>>>>>>>>> 0018_plataforma.sql <<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- Migración 0018: PLATAFORMA MULTI-TIENDA
--
-- Hasta la 0017 la base era de UNA tienda. Desde acá, una sola base aloja
-- muchas tiendas (cada cliente de la plataforma tiene la suya):
--
--   tiendas            → cada tienda: slug (su dirección /t/<slug>), datos de
--                        alta, estado de la prueba gratis y de la suscripción.
--   tienda_miembros    → quién administra cada tienda (la dueña y, a futuro,
--                        empleados). Reemplaza al "rol admin" global.
--   plataforma_admins  → el dueño de la plataforma (ve y gestiona todo).
--   tienda_secretos    → el Access Token de MercadoPago de cada tienda. SIN
--                        políticas: solo lo leen las Edge Functions (service
--                        role). La dueña lo carga con guardar_token_mp().
--
-- Todas las tablas de negocio ganan "tienda_id" y todas las políticas pasan a
-- ser "por tienda": una dueña solo ve y toca lo suyo, y el público solo ve
-- tiendas habilitadas (prueba vigente o suscripción activa).
--
-- Instalaciones de una sola tienda (0001-0017 con datos): todo lo existente
-- pasa a una tienda inicial cuyos administradores son los que tenían rol
-- admin. En una base nueva no se crea ninguna tienda.
--
-- Cómo correrla: pegá TODO este archivo en el SQL Editor de Supabase y
-- ejecutá. Es idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tablas de la plataforma
-- ----------------------------------------------------------------------------
create table if not exists public.tiendas (
  id                  uuid primary key default gen_random_uuid(),
  -- Dirección pública: /t/<slug>. Minúsculas, números y guiones.
  slug                text not null unique
                      check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  nombre              text not null check (length(trim(nombre)) > 0),
  rubro               text,
  -- Datos de alta (privados: solo los ve la dueña y la plataforma).
  email_admin         text not null,
  telefono            text,
  direccion           text,
  localidad           text,
  instagram           text,
  -- Estado comercial.
  suspendida          boolean not null default false,  -- corte manual de la plataforma
  prueba_hasta        timestamptz not null default now() + interval '14 days',
  suscripcion_estado  text not null default 'sin_suscripcion'
                      check (suscripcion_estado in ('sin_suscripcion', 'pendiente', 'activa', 'pausada', 'cancelada')),
  mp_preapproval_id   text,
  mp_conectado        boolean not null default false,  -- cargó su token de MP para cobrar
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now()
);

create table if not exists public.tienda_miembros (
  tienda_id  uuid not null references public.tiendas(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  rol        text not null default 'duena' check (rol in ('duena', 'admin')),
  created_at timestamptz not null default now(),
  primary key (tienda_id, user_id)
);
create index if not exists tienda_miembros_user_idx on public.tienda_miembros (user_id);

create table if not exists public.plataforma_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.tienda_secretos (
  tienda_id       uuid primary key references public.tiendas(id) on delete cascade,
  mp_access_token text,
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) Permisos
-- ----------------------------------------------------------------------------
create or replace function public.es_admin_plataforma()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.plataforma_admins where user_id = auth.uid());
$$;

-- ¿El usuario actual administra esta tienda? (miembro o admin de plataforma)
create or replace function public.es_admin_de(p_tienda uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select p_tienda is not null and (
    exists (select 1 from public.tienda_miembros where tienda_id = p_tienda and user_id = auth.uid())
    or public.es_admin_plataforma()
  );
$$;

-- Compatibilidad: lo que antes era "admin" ahora es "admin de la plataforma".
create or replace function public.es_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select public.es_admin_plataforma();
$$;

-- ¿La tienda está abierta al público? Prueba vigente o suscripción activa,
-- y que la plataforma no la haya suspendido.
create or replace function public.tienda_habilitada(p_tienda uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.tiendas t
     where t.id = p_tienda
       and not t.suspendida
       and (t.suscripcion_estado = 'activa' or t.prueba_hasta > now())
  );
$$;

-- promover_admin (0014) ahora da acceso de administrador de la PLATAFORMA.
create or replace function public.promover_admin(p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then return false; end if;
  insert into public.plataforma_admins (user_id) values (v_id) on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.promover_admin(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) tienda_id en las tablas de negocio
-- ----------------------------------------------------------------------------
alter table public.categorias add column if not exists tienda_id uuid references public.tiendas(id) on delete cascade;
alter table public.productos  add column if not exists tienda_id uuid references public.tiendas(id) on delete cascade;
alter table public.pedidos    add column if not exists tienda_id uuid references public.tiendas(id) on delete cascade;
alter table public.configuracion add column if not exists tienda_id uuid references public.tiendas(id) on delete cascade;

-- Instalación previa con datos: todo pasa a una tienda inicial.
do $$
declare
  v_hay_datos boolean;
  v_tienda    uuid;
  v_nombre    text;
  v_email     text;
begin
  select exists (select 1 from public.productos where tienda_id is null)
      or exists (select 1 from public.categorias where tienda_id is null)
      or exists (select 1 from public.pedidos where tienda_id is null)
      or exists (select 1 from public.configuracion where tienda_id is null and nombre_tienda is not null)
    into v_hay_datos;

  if v_hay_datos then
    select coalesce(nullif(trim(nombre_tienda), ''), 'Mi tienda') into v_nombre
      from public.configuracion where tienda_id is null limit 1;
    v_nombre := coalesce(v_nombre, 'Mi tienda');
    select u.email into v_email
      from public.profiles p join auth.users u on u.id = p.id
     where p.rol = 'admin' order by p.created_at limit 1;

    insert into public.tiendas (slug, nombre, email_admin, suscripcion_estado, prueba_hasta)
    values (
      coalesce(nullif(left(public.slugify(v_nombre), 40), ''), 'mi-tienda'),
      v_nombre, coalesce(v_email, 'admin@tienda.local'),
      'activa',  -- la tienda original no queda cortada al migrar
      now() + interval '14 days'
    )
    returning id into v_tienda;

    update public.categorias set tienda_id = v_tienda where tienda_id is null;
    update public.productos set tienda_id = v_tienda where tienda_id is null;
    update public.pedidos set tienda_id = v_tienda where tienda_id is null;
    update public.configuracion set tienda_id = v_tienda where tienda_id is null;

    -- Los admins de antes administran la tienda inicial y la plataforma.
    insert into public.tienda_miembros (tienda_id, user_id, rol)
      select v_tienda, id, 'duena' from public.profiles where rol = 'admin'
      on conflict do nothing;
    insert into public.plataforma_admins (user_id)
      select id from public.profiles where rol = 'admin'
      on conflict do nothing;
  end if;

  -- La fila vacía que dejaba la 0014 en una base nueva ya no sirve.
  delete from public.configuracion where tienda_id is null;
end $$;

alter table public.categorias alter column tienda_id set not null;
alter table public.productos  alter column tienda_id set not null;
alter table public.pedidos    alter column tienda_id set not null;
alter table public.configuracion alter column tienda_id set not null;

-- configuracion: de "una fila para toda la base" a "una fila por tienda".
alter table public.configuracion drop constraint if exists configuracion_pkey;
alter table public.configuracion drop column if exists id;
do $$
begin
  alter table public.configuracion add primary key (tienda_id);
exception when invalid_table_definition then null;  -- ya tenía la PK
end $$;

-- Unicidades por tienda: dos tiendas pueden tener la categoría "Remeras" y el
-- producto "remera-lisa".
alter table public.categorias drop constraint if exists categorias_nombre_key;
create unique index if not exists categorias_tienda_nombre_key on public.categorias (tienda_id, nombre);
drop index if exists public.productos_slug_key;
create unique index if not exists productos_tienda_slug_key on public.productos (tienda_id, slug);

create index if not exists productos_tienda_idx on public.productos (tienda_id, activo, orden);
create index if not exists pedidos_tienda_idx on public.pedidos (tienda_id, created_at desc);

-- Slug de producto único DENTRO de la tienda.
create or replace function public.slug_unico(txt text, self uuid, p_tienda uuid)
returns text language plpgsql as $$
declare
  base text := coalesce(public.slugify(txt), 'producto');
  candidato text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.productos where tienda_id = p_tienda and slug = candidato and id <> self
  ) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;
  return candidato;
end;
$$;

create or replace function public.productos_set_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or (tg_op = 'UPDATE' and new.nombre is distinct from old.nombre) then
    new.slug := public.slug_unico(new.nombre, new.id, new.tienda_id);
  end if;
  return new;
end;
$$;

-- La categoría de un producto tiene que ser de la misma tienda.
create or replace function public.productos_misma_tienda()
returns trigger language plpgsql as $$
begin
  if new.categoria_id is not null and not exists (
    select 1 from public.categorias where id = new.categoria_id and tienda_id = new.tienda_id
  ) then
    raise exception 'La categoría no pertenece a esta tienda.';
  end if;
  if tg_op = 'UPDATE' and new.tienda_id <> old.tienda_id then
    raise exception 'Un producto no puede cambiar de tienda.';
  end if;
  return new;
end;
$$;
drop trigger if exists productos_misma_tienda on public.productos;
create trigger productos_misma_tienda
  before insert or update of categoria_id, tienda_id on public.productos
  for each row execute function public.productos_misma_tienda();

-- Las columnas comerciales de una tienda (prueba, suscripción, suspensión,
-- conexión de MP) solo las cambia la plataforma o una Edge Function.
create or replace function public.tiendas_proteger()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.es_admin_plataforma() and (
       new.slug is distinct from old.slug
    or new.suspendida is distinct from old.suspendida
    or new.prueba_hasta is distinct from old.prueba_hasta
    or new.suscripcion_estado is distinct from old.suscripcion_estado
    or new.mp_preapproval_id is distinct from old.mp_preapproval_id
    or new.mp_conectado is distinct from old.mp_conectado
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Ese dato de la tienda lo gestiona la plataforma.';
  end if;
  return new;
end;
$$;
drop trigger if exists tiendas_proteger on public.tiendas;
create trigger tiendas_proteger
  before update on public.tiendas
  for each row execute function public.tiendas_proteger();

-- ----------------------------------------------------------------------------
-- 4) RLS por tienda (reemplaza a todas las políticas anteriores)
-- ----------------------------------------------------------------------------
alter table public.tiendas enable row level security;
alter table public.tienda_miembros enable row level security;
alter table public.plataforma_admins enable row level security;
alter table public.tienda_secretos enable row level security;  -- sin políticas: solo service role

drop policy if exists "tiendas lectura miembros" on public.tiendas;
create policy "tiendas lectura miembros" on public.tiendas for select to authenticated
  using (public.es_admin_de(id));
drop policy if exists "tiendas update miembros" on public.tiendas;
create policy "tiendas update miembros" on public.tiendas for update to authenticated
  using (public.es_admin_de(id)) with check (public.es_admin_de(id));

drop policy if exists "miembros lectura" on public.tienda_miembros;
create policy "miembros lectura" on public.tienda_miembros for select to authenticated
  using (user_id = auth.uid() or public.es_admin_de(tienda_id));

drop policy if exists "plataforma admins lectura propia" on public.plataforma_admins;
create policy "plataforma admins lectura propia" on public.plataforma_admins for select to authenticated
  using (user_id = auth.uid());

-- Configuración: pública (marca y contacto de la tienda), edita su admin.
drop policy if exists "configuracion lectura publica" on public.configuracion;
create policy "configuracion lectura publica" on public.configuracion for select
  using (true);
drop policy if exists "configuracion update admin" on public.configuracion;
create policy "configuracion update admin" on public.configuracion for update to authenticated
  using (public.es_admin_de(tienda_id)) with check (public.es_admin_de(tienda_id));

-- Categorías.
drop policy if exists "categorias lectura publica" on public.categorias;
create policy "categorias lectura publica" on public.categorias for select
  to anon, authenticated
  using (public.tienda_habilitada(tienda_id) or public.es_admin_de(tienda_id));
drop policy if exists "categorias escritura autenticada" on public.categorias;
drop policy if exists "categorias escritura admin" on public.categorias;
create policy "categorias escritura admin" on public.categorias for all to authenticated
  using (public.es_admin_de(tienda_id)) with check (public.es_admin_de(tienda_id));

-- Productos.
drop policy if exists "productos lectura publica" on public.productos;
create policy "productos lectura publica" on public.productos for select
  to anon, authenticated
  using ((activo and public.tienda_habilitada(tienda_id)) or public.es_admin_de(tienda_id));
drop policy if exists "productos escritura autenticada" on public.productos;
drop policy if exists "productos escritura admin" on public.productos;
create policy "productos escritura admin" on public.productos for all to authenticated
  using (public.es_admin_de(tienda_id)) with check (public.es_admin_de(tienda_id));

-- Variantes: la tienda es la de su producto.
drop policy if exists "variantes escritura admin" on public.producto_variantes;
create policy "variantes escritura admin" on public.producto_variantes for all to authenticated
  using (public.es_admin_de((select tienda_id from public.productos p where p.id = producto_id)))
  with check (public.es_admin_de((select tienda_id from public.productos p where p.id = producto_id)));

-- Pedidos: el cliente ve los suyos; la tienda, los de ella. Alta solo por
-- crear_pedido().
drop policy if exists "pedidos insert publico" on public.pedidos;
drop policy if exists "pedidos lectura autenticada" on public.pedidos;
drop policy if exists "pedidos gestion autenticada" on public.pedidos;
drop policy if exists "pedidos select propio o admin" on public.pedidos;
create policy "pedidos select propio o admin" on public.pedidos for select to authenticated
  using (user_id = auth.uid() or public.es_admin_de(tienda_id));
drop policy if exists "pedidos update admin" on public.pedidos;
create policy "pedidos update admin" on public.pedidos for update to authenticated
  using (public.es_admin_de(tienda_id)) with check (public.es_admin_de(tienda_id));
drop policy if exists "pedidos delete admin" on public.pedidos;
create policy "pedidos delete admin" on public.pedidos for delete to authenticated
  using (public.es_admin_de(tienda_id));

-- Storage: cada tienda sube a su carpeta "<tienda_id>/..." del bucket.
create or replace function public.uuid_o_null(txt text)
returns uuid language plpgsql immutable as $$
begin
  return txt::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists "productos storage insert admin" on storage.objects;
create policy "productos storage insert admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'productos'
    and public.es_admin_de(public.uuid_o_null((storage.foldername(name))[1])));
drop policy if exists "productos storage update admin" on storage.objects;
create policy "productos storage update admin" on storage.objects for update to authenticated
  using (bucket_id = 'productos'
    and public.es_admin_de(public.uuid_o_null((storage.foldername(name))[1])));
drop policy if exists "productos storage delete admin" on storage.objects;
create policy "productos storage delete admin" on storage.objects for delete to authenticated
  using (bucket_id = 'productos'
    and public.es_admin_de(public.uuid_o_null((storage.foldername(name))[1])));

-- ----------------------------------------------------------------------------
-- 5) Funciones para el front
-- ----------------------------------------------------------------------------

-- Lo mínimo y público de una tienda, para arrancar su vitrina por slug:
-- si está abierta, su rubro (define variantes y atributos) y si puede cobrar
-- online (conectó su MercadoPago). Nada de los datos privados de alta.
drop function if exists public.tienda_publica(text);
create or replace function public.tienda_publica(p_slug text)
returns table (id uuid, slug text, nombre text, habilitada boolean, rubro text, mp_conectado boolean)
language sql security definer stable set search_path = public as $$
  select t.id, t.slug, t.nombre, public.tienda_habilitada(t.id), t.rubro, t.mp_conectado
    from public.tiendas t where t.slug = lower(p_slug);
$$;
grant execute on function public.tienda_publica(text) to anon, authenticated;

-- Direcciones que no puede tomar una tienda (rutas de la plataforma).
create or replace function public.slug_reservado(p_slug text)
returns boolean language sql immutable as $$
  select lower(p_slug) = any (array[
    'admin', 'api', 'app', 'crear', 'demo', 'ingresar', 'panel', 'plataforma', 'precios',
    'soporte', 'ayuda', 't', 'tienda', 'tiendas', 'www', 'mail', 'blog', 'legal', 'terminos', 'privacidad'
  ]);
$$;

create or replace function public.slug_disponible(p_slug text)
returns boolean language sql security definer stable set search_path = public as $$
  select lower(p_slug) ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and not public.slug_reservado(p_slug)
     and not exists (select 1 from public.tiendas where slug = lower(p_slug));
$$;
grant execute on function public.slug_disponible(text) to anon, authenticated;

-- Categorías iniciales según el rubro (antes eran los seeds).
create or replace function public.categorias_iniciales(p_rubro text)
returns text[] language sql immutable as $$
  select case p_rubro
    when 'ropa' then array['Remeras', 'Pantalones', 'Abrigos', 'Accesorios']
    when 'deco' then array['Living', 'Cocina', 'Dormitorio', 'Iluminación']
    when 'alimentos' then array['Dulces', 'Salados', 'Bebidas', 'Cajas y regalos']
    when 'bebes' then array['Bodies', 'Mantas', 'Accesorios', 'Regalos']
    else array['Destacados', 'Novedades', 'Ofertas']
  end;
$$;

-- Alta de una tienda: la crea quien está logueado, que queda como dueña.
-- Empieza con la prueba gratis (prueba_hasta) y su configuración inicial.
create or replace function public.crear_tienda(
  p_slug        text,
  p_nombre      text,
  p_rubro       text,
  p_email_admin text,
  p_telefono    text,
  p_direccion   text default null,
  p_localidad   text default null,
  p_instagram   text default null,
  p_preset      text default 'calido',
  p_color       text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_tienda uuid;
  v_cat    text;
  v_wa     text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión para crear una tienda.';
  end if;
  if not public.slug_disponible(p_slug) then
    raise exception 'La dirección "%" no está disponible.', p_slug;
  end if;
  -- Freno a altas en masa: hasta 3 tiendas por cuenta (la plataforma, sin límite).
  if not public.es_admin_plataforma()
     and (select count(*) from public.tienda_miembros where user_id = v_uid and rol = 'duena') >= 3 then
    raise exception 'Llegaste al máximo de tiendas por cuenta.';
  end if;

  insert into public.tiendas (slug, nombre, rubro, email_admin, telefono, direccion, localidad, instagram, created_by)
  values (lower(p_slug), trim(p_nombre), p_rubro, trim(p_email_admin), p_telefono, p_direccion, p_localidad,
          nullif(regexp_replace(coalesce(p_instagram, ''), '^@', ''), ''), v_uid)
  returning id into v_tienda;

  insert into public.tienda_miembros (tienda_id, user_id, rol) values (v_tienda, v_uid, 'duena');

  insert into public.configuracion (tienda_id, nombre_tienda, whatsapp, instagram, email_contacto, tema_preset, color_primario)
  values (
    v_tienda, trim(p_nombre),
    case when v_wa ~ '^[0-9]{8,15}$' then v_wa end,
    nullif(regexp_replace(coalesce(p_instagram, ''), '^@', ''), ''),
    trim(p_email_admin),
    case when p_preset in ('calido', 'minimal', 'oscuro', 'vibrante') then p_preset else 'calido' end,
    case when p_color ~* '^#[0-9a-f]{6}$' then p_color end
  );

  foreach v_cat in array public.categorias_iniciales(p_rubro) loop
    insert into public.categorias (tienda_id, nombre) values (v_tienda, v_cat);
  end loop;

  return v_tienda;
end;
$$;
revoke execute on function public.crear_tienda(text, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.crear_tienda(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- La dueña carga (o borra, con null) el Access Token de MercadoPago con el
-- que cobra su tienda. Nunca se puede volver a leer desde el front.
create or replace function public.guardar_token_mp(p_tienda uuid, p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin_de(p_tienda) then
    raise exception 'No administrás esta tienda.';
  end if;
  if p_token is not null and p_token !~ '^(APP_USR|TEST)-[A-Za-z0-9-]{20,}$' then
    raise exception 'Ese no parece un Access Token de MercadoPago (empieza con APP_USR- o TEST-).';
  end if;
  insert into public.tienda_secretos (tienda_id, mp_access_token, updated_at)
  values (p_tienda, nullif(trim(p_token), ''), now())
  on conflict (tienda_id) do update set mp_access_token = excluded.mp_access_token, updated_at = now();
  -- mp_conectado lo protege tiendas_proteger() para el front; esta función
  -- corre como su dueño (security definer), así que puede escribirlo.
  update public.tiendas set mp_conectado = (p_token is not null and trim(p_token) <> '') where id = p_tienda;
end;
$$;
revoke execute on function public.guardar_token_mp(uuid, text) from anon;
grant execute on function public.guardar_token_mp(uuid, text) to authenticated;

-- Orden manual del catálogo (reemplaza la de la 0015).
drop function if exists public.ordenar_productos(uuid[]);
create or replace function public.ordenar_productos(p_tienda uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_admin_de(p_tienda) then
    raise exception 'Solo el admin de la tienda puede ordenar productos.';
  end if;
  update public.productos p
     set orden = o.pos
    from unnest(p_ids) with ordinality as o(id, pos)
   where p.id = o.id and p.tienda_id = p_tienda;
end;
$$;
revoke execute on function public.ordenar_productos(uuid, uuid[]) from anon;
grant execute on function public.ordenar_productos(uuid, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 6) crear_pedido v4: igual que la v3 (0016) pero de UNA tienda (p_tienda).
--    Los productos tienen que ser de esa tienda, el envío es el de su
--    configuración y una tienda pausada no recibe pedidos.
-- ----------------------------------------------------------------------------
drop function if exists public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text, text
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
  p_metodo_pago text default 'coordinar',
  p_tienda      uuid default null        -- obligatorio desde la 0018 (ver abajo)
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero      bigint;
  v_uid         uuid := auth.uid();
  v_admin       boolean := public.es_admin_de(p_tienda);
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

  if p_tienda is null or not exists (select 1 from public.tiendas where id = p_tienda) then
    raise exception 'Tienda inexistente.';
  end if;
  -- Una tienda pausada no vende (su admin sí puede cargar pedidos a mano).
  if not v_admin and not public.tienda_habilitada(p_tienda) then
    raise exception 'Esta tienda no está recibiendo pedidos en este momento.';
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
     where id = v_id and tienda_id = p_tienda and (activo or v_admin);
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
    select * into v_cfg from public.configuracion where tienda_id = p_tienda;
    v_envio := coalesce(v_cfg.envio_costo, 0);
    if v_cfg.envio_gratis_desde is not null and v_subtotal >= v_cfg.envio_gratis_desde then
      v_envio := 0;
    end if;
  end if;

  insert into public.pedidos
    (tienda_id, user_id, nombre, telefono, email, entrega, direccion, localidad, cp, notas,
     items, subtotal, envio, origen, metodo_pago)
  values
    (p_tienda, v_uid, p_nombre, p_telefono, nullif(p_email, ''), v_entrega,
     p_direccion, p_localidad, p_cp, p_notas, v_items, v_subtotal, v_envio,
     v_origen, v_metodo)
  returning numero into v_numero;

  return v_numero;
end;
$$;

revoke execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text, text, uuid
) from anon;
grant execute on function public.crear_pedido(
  text, text, text, text, text, text, text, text, jsonb, numeric, text, text, uuid
) to authenticated;
