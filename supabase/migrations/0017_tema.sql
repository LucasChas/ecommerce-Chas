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
