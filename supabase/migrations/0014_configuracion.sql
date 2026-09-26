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
