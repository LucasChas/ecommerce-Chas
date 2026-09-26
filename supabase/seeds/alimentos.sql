-- ============================================================================
-- Seed de categorías iniciales: alimentos
-- Lo copia `pnpm nueva-tienda` a supabase/seed.sql. Se puede correr en el SQL
-- Editor después de instalar.sql, o con `pnpm db:seed`. Es idempotente.
-- ============================================================================
insert into public.categorias (nombre) values
  ('Dulces'),
  ('Salados'),
  ('Bebidas'),
  ('Cajas y regalos')
on conflict (nombre) do nothing;
