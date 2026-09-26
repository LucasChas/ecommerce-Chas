-- ============================================================================
-- Seed de categorías iniciales: deco y hogar
-- Lo copia `pnpm nueva-tienda` a supabase/seed.sql. Se puede correr en el SQL
-- Editor después de instalar.sql, o con `pnpm db:seed`. Es idempotente.
-- ============================================================================
insert into public.categorias (nombre) values
  ('Living'),
  ('Cocina'),
  ('Dormitorio'),
  ('Iluminación')
on conflict (nombre) do nothing;
