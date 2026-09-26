-- ============================================================================
-- Seed de categorías iniciales: ropa y accesorios
-- Lo copia `pnpm nueva-tienda` a supabase/seed.sql. Se puede correr en el SQL
-- Editor después de instalar.sql, o con `pnpm db:seed`. Es idempotente.
-- ============================================================================
insert into public.categorias (nombre) values
  ('Remeras'),
  ('Pantalones'),
  ('Abrigos'),
  ('Accesorios')
on conflict (nombre) do nothing;
