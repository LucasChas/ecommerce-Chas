-- ============================================================================
-- Pruebas de las reglas de negocio de la base (stock, variantes, envío,
-- permisos). Se corren sobre una base recién instalada:
--
--   psql ... -f supabase/tests/stub_supabase.sql
--   psql ... -f supabase/instalar.sql      (sin la línea de pg_net)
--   psql ... -v ON_ERROR_STOP=1 -f supabase/tests/negocio.sql
--
-- Cualquier regla rota corta con "FALLO: ...". Lo corre la CI.
-- ============================================================================

-- Helpers: afirmar igualdad y afirmar que algo falla.
create or replace function pg_temp.igual(p_obtenido anyelement, p_esperado anyelement, p_que text)
returns void language plpgsql as $$
begin
  if p_obtenido is distinct from p_esperado then
    raise exception 'FALLO: % (obtenido %, esperado %)', p_que, p_obtenido, p_esperado;
  end if;
end $$;

create or replace function pg_temp.falla(p_sql text, p_que text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLO: debía fallar: %', p_que;
exception when others then
  if sqlerrm like 'FALLO:%' then raise; end if;
end $$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'duena@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'cliente@test.com');
select pg_temp.igual(public.promover_admin('DUENA@test.com'), true, 'promover_admin encuentra la cuenta');
select pg_temp.igual(public.promover_admin('nadie@test.com'), false, 'promover_admin sin cuenta');

update public.configuracion set envio_costo = 1500, envio_gratis_desde = 50000 where id;
insert into public.categorias (id, nombre) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Ropa');
insert into public.productos (id, nombre, categoria_id, precio, stock) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Remera', 'aaaaaaaa-0000-0000-0000-000000000001', 10000, 0),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Gorro',  'aaaaaaaa-0000-0000-0000-000000000001', 5000, 4),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'Oculto', 'aaaaaaaa-0000-0000-0000-000000000001', 1000, 9);
update public.productos set activo = false where nombre = 'Oculto';
insert into public.producto_variantes (id, producto_id, nombre, stock) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'S', 2),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001', 'M', 3);

-- Variantes: el stock del producto es la suma y no se edita directo.
select pg_temp.igual((select stock from public.productos where nombre = 'Remera'), 5, 'stock = suma de variantes');
select pg_temp.falla($$update public.productos set stock = 99 where nombre = 'Remera'$$, 'editar stock de producto con variantes');

-- Cliente logueado.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);

-- RLS: el update de un cliente no falla, afecta 0 filas.
update public.configuracion set nombre_tienda = 'hackeada' where id;
reset role;
select pg_temp.igual((select nombre_tienda from public.configuracion), null::text, 'cliente no edita la configuración');
set role authenticated;

select pg_temp.falla($$select public.promover_admin('cliente@test.com')$$, 'cliente se autopromueve');
select pg_temp.igual((select count(*)::int from public.productos where nombre = 'Oculto'), 0, 'cliente no ve ocultos');
select pg_temp.falla(
  $$select public.crear_pedido('A','351','','coordinar','','','','','[{"id":"bbbbbbbb-0000-0000-0000-000000000001","cantidad":1}]', 0)$$,
  'producto con variantes sin elegir opción');
select pg_temp.falla(
  $$select public.crear_pedido('A','351','','coordinar','','','','','[{"id":"bbbbbbbb-0000-0000-0000-000000000001","variante_id":"cccccccc-0000-0000-0000-000000000001","cantidad":3}]', 0)$$,
  'más unidades que el stock de la variante');
select pg_temp.falla(
  $$select public.crear_pedido('A','351','','coordinar','','','','','[{"id":"bbbbbbbb-0000-0000-0000-000000000003","cantidad":1}]', 0)$$,
  'producto oculto');

-- Pedido válido: S x2 + Gorro x1 con envío; intenta origen admin (no puede).
select pg_temp.igual(public.crear_pedido('A','351','a@x.com','envio','C 1','Cba','5000','',
  '[{"id":"bbbbbbbb-0000-0000-0000-000000000001","variante_id":"cccccccc-0000-0000-0000-000000000001","cantidad":2},
    {"id":"bbbbbbbb-0000-0000-0000-000000000002","cantidad":1}]', 1, 'admin', 'mercadopago'), 1::bigint, 'pedido 1 creado');
reset role;

select pg_temp.igual((select subtotal from public.pedidos where numero = 1), 25000.00::numeric, 'subtotal con precios de la base');
select pg_temp.igual((select envio from public.pedidos where numero = 1), 1500.00::numeric, 'costo de envío');
select pg_temp.igual((select total from public.pedidos where numero = 1), 26500.00::numeric, 'total = subtotal + envío');
select pg_temp.igual((select origen from public.pedidos where numero = 1), 'checkout', 'origen admin reservado al admin');
select pg_temp.igual((select metodo_pago from public.pedidos where numero = 1), 'mercadopago', 'método de pago');
select pg_temp.igual((select items->0->>'nombre' from public.pedidos where numero = 1), 'Remera — S', 'nombre con variante');
select pg_temp.igual((select stock from public.producto_variantes where nombre = 'S'), 0, 'descuenta la variante');
select pg_temp.igual((select stock from public.productos where nombre = 'Remera'), 3, 'producto = suma tras la venta');
select pg_temp.igual((select stock from public.productos where nombre = 'Gorro'), 3, 'descuenta producto sin variantes');

-- Envío gratis desde 50000.
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select public.crear_pedido('A','351','','envio','C','C','1','',
  '[{"id":"bbbbbbbb-0000-0000-0000-000000000001","variante_id":"cccccccc-0000-0000-0000-000000000002","cantidad":3},
    {"id":"bbbbbbbb-0000-0000-0000-000000000002","cantidad":3}]', 0);
reset role;
select pg_temp.igual((select envio from public.pedidos where numero = 2), 1500.00::numeric, 'envío cobrado bajo el mínimo (45000)');
update public.configuracion set envio_gratis_desde = 40000 where id;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
-- La admin puede vender el oculto a mano.
select public.crear_pedido('B','351','','envio','C','C','1','',
  '[{"id":"bbbbbbbb-0000-0000-0000-000000000003","cantidad":1}]', 0, 'admin');
reset role;
select pg_temp.igual((select origen from public.pedidos where numero = 3), 'admin', 'carga manual de la admin');
select pg_temp.igual((select envio from public.pedidos where numero = 3), 1500.00::numeric, 'bajo el mínimo nuevo');

-- Cancelar devuelve stock a la variante y al producto.
update public.pedidos set estado = 'cancelado' where numero = 1;
select pg_temp.igual((select stock from public.producto_variantes where nombre = 'S'), 2, 'cancelar devuelve a la variante');
select pg_temp.igual((select stock from public.productos where nombre = 'Gorro'), 1, 'cancelar devuelve al producto');

-- Reactivar sin stock suficiente falla.
update public.pedidos set estado = 'cancelado' where numero = 2;
update public.producto_variantes set stock = 0 where nombre = 'M';
select pg_temp.falla($$update public.pedidos set estado = 'nuevo' where numero = 2$$, 'reactivar sin stock');

-- Borrar la última variante deja el producto en 0 y editable a mano.
delete from public.producto_variantes where producto_id = 'bbbbbbbb-0000-0000-0000-000000000001';
select pg_temp.igual((select stock from public.productos where nombre = 'Remera'), 0, 'sin variantes → 0');
update public.productos set stock = 7 where nombre = 'Remera';

-- Orden manual (solo admin).
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.falla($$select public.ordenar_productos(array['bbbbbbbb-0000-0000-0000-000000000002']::uuid[])$$, 'cliente ordena');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.ordenar_productos(array['bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000001']::uuid[]);
reset role;
select pg_temp.igual((select orden from public.productos where nombre = 'Gorro'), 1, 'orden manual');

\echo '✓ Reglas de negocio OK'
