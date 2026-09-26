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
