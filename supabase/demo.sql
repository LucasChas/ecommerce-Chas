-- ============================================================================
-- Tienda de ejemplo de la plataforma (/t/demo), la que enlaza la landing.
--
-- Correr una vez en el SQL Editor, después de instalar.sql. No tiene dueña:
-- la administra el admin de la plataforma (promover_admin). Suscripción
-- activa para que no se pause nunca. Es idempotente: si ya existe, no hace nada.
-- Las fotos se cargan después desde el panel (/t/demo/admin).
-- ============================================================================
do $$
declare
  v_tienda uuid;
  v_cat    uuid;
  v_prod   uuid;
begin
  if exists (select 1 from public.tiendas where slug = 'demo') then
    raise notice 'La tienda demo ya existe.';
    return;
  end if;

  insert into public.tiendas (slug, nombre, rubro, email_admin, suscripcion_estado, prueba_hasta)
  values ('demo', 'Pequeña Oveja', 'bebes', 'demo@plataforma.local', 'activa', now() + interval '100 years')
  returning id into v_tienda;

  insert into public.configuracion (tienda_id, nombre_tienda, eslogan, whatsapp, email_contacto, tema_preset, envio_costo, envio_gratis_desde)
  values (v_tienda, 'Pequeña Oveja', 'Ropa y accesorios de bebé', '5490000000000', 'demo@plataforma.local', 'calido', 3500, 60000);

  insert into public.categorias (tienda_id, nombre) values (v_tienda, 'Bodies') returning id into v_cat;
  insert into public.productos (tienda_id, nombre, categoria_id, descripcion, precio, stock, atributos, orden)
  values (v_tienda, 'Body manga larga', v_cat, 'Algodón suave, broches al costado para cambiarlo fácil.', 14500, 0,
          '{"material": "Algodón peinado", "cuidados": "Lavar del revés en frío"}', 1)
  returning id into v_prod;
  insert into public.producto_variantes (producto_id, nombre, stock, orden) values
    (v_prod, 'RN', 3, 0), (v_prod, '0-3 m', 5, 1), (v_prod, '3-6 m', 0, 2), (v_prod, '6-9 m', 2, 3);

  insert into public.productos (tienda_id, nombre, categoria_id, descripcion, precio, stock, orden)
  values (v_tienda, 'Body de lino', v_cat, 'Fresco para el verano.', 16900, 4, 2);

  insert into public.categorias (tienda_id, nombre) values (v_tienda, 'Mantas') returning id into v_cat;
  insert into public.productos (tienda_id, nombre, categoria_id, descripcion, precio, stock, orden)
  values (v_tienda, 'Manta tejida', v_cat, 'Tejida a mano con borde festoneado.', 32000, 2, 3),
         (v_tienda, 'Manta muselina', v_cat, 'Liviana y respirable, 120 x 120 cm.', 18900, 6, 4);

  insert into public.categorias (tienda_id, nombre) values (v_tienda, 'Accesorios') returning id into v_cat;
  insert into public.productos (tienda_id, nombre, categoria_id, descripcion, precio, stock, orden)
  values (v_tienda, 'Gorrito con orejas', v_cat, 'El clásico de la ovejita.', 8900, 8, 5),
         (v_tienda, 'Babero de toalla', v_cat, 'Con broche de presión.', 5200, 0, 6);
end $$;
