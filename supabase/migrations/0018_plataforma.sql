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
