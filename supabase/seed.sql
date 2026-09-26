-- ============================================================================
-- Seed de categorías iniciales: genérico
-- Lo copia `pnpm nueva-tienda` a supabase/seed.sql. Se puede correr en el SQL
-- Editor después de instalar.sql, o con `pnpm db:seed`. Es idempotente.
-- ============================================================================
insert into public.categorias (nombre) values
  ('Destacados'),
  ('Novedades'),
  ('Ofertas')
on conflict (nombre) do nothing;
