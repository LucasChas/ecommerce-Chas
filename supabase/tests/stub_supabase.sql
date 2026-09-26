-- ============================================================================
-- Lo mínimo de Supabase para probar supabase/instalar.sql en un Postgres
-- común (CI y pruebas locales): roles, esquemas auth/storage/vault, auth.uid(),
-- publicación de Realtime y un net.http_post falso (pg_net no está en un
-- Postgres común; por eso la prueba saltea el 'create extension pg_net').
-- NO se usa en Supabase real.
-- ============================================================================
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema auth; create schema storage; create schema extensions; create schema vault;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create table vault.decrypted_secrets (name text, decrypted_secret text);
create schema net; create or replace function net.http_post(url text, body jsonb, headers jsonb default '{}', params jsonb default '{}', timeout_milliseconds int default 1000) returns bigint language sql as $$ select 1::bigint $$;
create publication supabase_realtime;
