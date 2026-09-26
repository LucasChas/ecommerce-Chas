-- ============================================================================
-- INSTALACIÓN COMPLETA (archivo generado con `pnpm sql:instalacion`, no editar)
--
-- Pegá TODO este archivo en Supabase → SQL Editor → New query y ejecutá.
-- Incluye, en orden: 0001_init.sql, 0002_imagenes_multiples.sql, 0003_pedidos.sql, 0004_crear_pedido.sql, 0005_cuentas.sql, 0006_stock_y_precios.sql, 0007_borrar_pedidos.sql, 0008_devolver_stock.sql, 0009_papelera_pedidos.sql, 0010_pedido_eliminado_visible.sql, 0011_slug_productos.sql, 0012_email_pedido.sql, 0013_origen_pedido.sql, 0014_configuracion.sql
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
