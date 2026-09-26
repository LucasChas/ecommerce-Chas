-- ============================================================================
-- Pruebas de las reglas de negocio de la plataforma (aislamiento entre
-- tiendas, alta, suscripción, stock, variantes, envío, permisos). Se corren
-- sobre una base recién instalada:
--
--   psql ... -f supabase/tests/stub_supabase.sql
--   psql ... -f supabase/instalar.sql      (sin la línea de pg_net)
--   psql ... -v ON_ERROR_STOP=1 -f supabase/tests/negocio.sql
--
-- Cualquier regla rota corta con "FALLO: ...". Lo corre la CI.
--
-- Personajes: Ana (dueña de la tienda A), Beto (dueño de la tienda B),
-- Carla (clienta) y Lucas (admin de la plataforma).
-- ============================================================================

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

-- Cambiar de usuario (simula el JWT de Supabase).
create or replace function pg_temp.como(p_uid text)
returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_uid, false);
$$;

-- Supabase le da estos permisos de tabla a los roles de la API.
grant usage on schema public, storage to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on storage.objects to authenticated;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'ana@test.com'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'beto@test.com'),
  ('cccccccc-0000-0000-0000-00000000000c', 'carla@test.com'),
  ('dddddddd-0000-0000-0000-00000000000d', 'lucas@test.com');
select pg_temp.igual(public.promover_admin('LUCAS@test.com'), true, 'promover_admin de plataforma');

create temp table ids (clave text primary key, id uuid);
grant all on ids to anon, authenticated;
create or replace function pg_temp.id(p_clave text) returns uuid language sql as $$
  select id from ids where clave = p_clave;
$$;

-- ---------------------------------------------------------------- Alta
select pg_temp.como('');  -- anon no tiene usuario
set role anon;
select pg_temp.falla($$select public.crear_tienda('tienda-a','A','ropa','a@x.com','351')$$, 'anon crea tienda');
reset role;

set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.falla($$select public.crear_tienda('admin','A','ropa','a@x.com','351')$$, 'slug reservado');
select pg_temp.falla($$select public.crear_tienda('A B','A','ropa','a@x.com','351')$$, 'slug inválido');
select pg_temp.igual(public.slug_disponible('tienda-a'), true, 'slug libre');
insert into ids values ('A', public.crear_tienda('tienda-a', 'Tienda A', 'ropa', 'ana@test.com', '+54 9 351 111-2222',
  'Calle 1', 'Córdoba', '@tiendaa', 'oscuro', '#112233'));
select pg_temp.igual(public.slug_disponible('tienda-a'), false, 'slug tomado');
select pg_temp.falla($$select public.crear_tienda('tienda-a','Otra','ropa','a@x.com','351')$$, 'slug duplicado');
reset role;

select pg_temp.igual((select count(*)::int from public.categorias where tienda_id = pg_temp.id('A')), 4, 'categorías del rubro ropa');
select pg_temp.igual((select whatsapp from public.configuracion where tienda_id = pg_temp.id('A')), '5493511112222', 'WhatsApp normalizado');
select pg_temp.igual((select tema_preset from public.configuracion where tienda_id = pg_temp.id('A')), 'oscuro', 'preset elegido');
select pg_temp.igual((select instagram from public.tiendas where slug = 'tienda-a'), 'tiendaa', 'instagram sin @');
select pg_temp.igual((select rol from public.tienda_miembros where tienda_id = pg_temp.id('A')), 'duena', 'Ana es la dueña');

set role authenticated;
select pg_temp.como('bbbbbbbb-0000-0000-0000-00000000000b');
insert into ids values ('B', public.crear_tienda('tienda-b', 'Tienda B', 'deco', 'beto@test.com', '3512223333'));
reset role;

-- --------------------------------------------------- Aislamiento entre tiendas
set role authenticated;
select pg_temp.como('aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.igual((select count(*)::int from public.tiendas), 1, 'Ana solo ve su tienda');
-- RLS: el update sobre otra tienda no falla, afecta 0 filas (se verifica abajo).
update public.configuracion set nombre_tienda = 'hackeada' where tienda_id = pg_temp.id('B');
select pg_temp.falla(format($$insert into public.categorias (tienda_id, nombre) values (%L, 'x')$$, pg_temp.id('B')),
  'Ana crea categoría en B');
select pg_temp.falla($$update public.tiendas set prueba_hasta = now() + interval '10 years' where slug = 'tienda-a'$$,
  'Ana se extiende la prueba');
select pg_temp.falla($$update public.tiendas set suscripcion_estado = 'activa' where slug = 'tienda-a'$$,
  'Ana se activa la suscripción');
update public.tiendas set telefono = '3519998888' where slug = 'tienda-a';  -- sus datos sí
select pg_temp.falla(format($$select public.guardar_token_mp(%L, 'APP_USR-123456789012345678901234')$$, pg_temp.id('B')),
  'Ana carga token en B');
select pg_temp.falla(format($$select public.guardar_token_mp(%L, 'cualquier-cosa')$$, pg_temp.id('A')),
  'token con formato inválido');
select public.guardar_token_mp(pg_temp.id('A'), 'TEST-1234567890-abcdefghijklmnopqrstuvwxyz');
select pg_temp.igual((select count(*)::int from public.tienda_secretos), 0, 'el token no se puede leer desde la API');
-- Storage: solo su carpeta.
insert into storage.objects (bucket_id, name) values ('productos', pg_temp.id('A')::text || '/foto.jpg');
select pg_temp.falla(format($$insert into storage.objects (bucket_id, name) values ('productos', %L)$$,
  pg_temp.id('B')::text || '/foto.jpg'), 'Ana sube a la carpeta de B');
select pg_temp.falla($$insert into storage.objects (bucket_id, name) values ('productos', 'suelto.jpg')$$,
  'subir fuera de una carpeta de tienda');
reset role;

select pg_temp.igual((select nombre_tienda from public.configuracion where tienda_id = pg_temp.id('B')), 'Tienda B', 'config de B intacta');
select pg_temp.igual((select telefono from public.tiendas where slug = 'tienda-a'), '3519998888', 'Ana edita sus datos');
select pg_temp.igual((select mp_conectado from public.tiendas where slug = 'tienda-a'), true, 'MP conectado');
select pg_temp.igual((select mp_access_token from public.tienda_secretos where tienda_id = pg_temp.id('A')),
  'TEST-1234567890-abcdefghijklmnopqrstuvwxyz', 'token guardado');

-- ------------------------------------------------------ Catálogo por tienda
insert into public.productos (id, tienda_id, nombre, categoria_id, precio, stock) values
  ('10000000-0000-0000-0000-000000000001', pg_temp.id('A'), 'Remera',
   (select id from public.categorias where tienda_id = pg_temp.id('A') and nombre = 'Remeras'), 10000, 0),
  ('10000000-0000-0000-0000-000000000002', pg_temp.id('A'), 'Gorro', null, 5000, 4),
  ('10000000-0000-0000-0000-000000000003', pg_temp.id('A'), 'Oculto', null, 1000, 9),
  ('20000000-0000-0000-0000-000000000001', pg_temp.id('B'), 'Gorro', null, 7000, 5);
update public.productos set activo = false where nombre = 'Oculto';
insert into public.producto_variantes (id, producto_id, nombre, stock) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'S', 2),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'M', 3);

select pg_temp.igual((select count(*)::int from public.productos where slug = 'gorro'), 2, 'mismo slug en dos tiendas');
select pg_temp.falla(format($$insert into public.productos (tienda_id, nombre, categoria_id) values (%L, 'x', %L)$$,
  pg_temp.id('B'), (select id from public.categorias where tienda_id = pg_temp.id('A') limit 1)),
  'categoría de otra tienda');
select pg_temp.igual((select stock from public.productos where id = '10000000-0000-0000-0000-000000000001'), 5, 'stock = suma de variantes');
select pg_temp.falla($$update public.productos set stock = 99 where id = '10000000-0000-0000-0000-000000000001'$$, 'stock directo con variantes');

select pg_temp.como('');  -- anon no tiene usuario
set role anon;
select pg_temp.igual((select count(*)::int from public.productos), 3, 'anon ve los activos de tiendas habilitadas');
select pg_temp.igual((select habilitada from public.tienda_publica('tienda-a')), true, 'tienda_publica');
reset role;

set role authenticated;
select pg_temp.como('bbbbbbbb-0000-0000-0000-00000000000b');
select pg_temp.igual((select count(*)::int from public.productos where tienda_id = pg_temp.id('A') and not activo), 0,
  'Beto no ve los ocultos de A');
select pg_temp.falla(format($$select public.ordenar_productos(%L, array['10000000-0000-0000-0000-000000000002']::uuid[])$$,
  pg_temp.id('A')), 'Beto ordena A');
update public.producto_variantes set stock = 50 where id = '30000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.igual((select stock from public.producto_variantes where id = '30000000-0000-0000-0000-000000000001'), 2,
  'Beto no toca variantes de A');

-- --------------------------------------------------------------- Pedidos
update public.configuracion set envio_costo = 1500, envio_gratis_desde = 50000 where tienda_id = pg_temp.id('A');

set role authenticated;
select pg_temp.como('cccccccc-0000-0000-0000-00000000000c');
select pg_temp.falla(format($$select public.crear_pedido('C','351','','coordinar','','','','',
  '[{"id":"20000000-0000-0000-0000-000000000001","cantidad":1}]', 0, 'checkout', 'coordinar', %L)$$, pg_temp.id('A')),
  'producto de B en un pedido de A');
select pg_temp.falla(format($$select public.crear_pedido('C','351','','coordinar','','','','',
  '[{"id":"10000000-0000-0000-0000-000000000001","cantidad":1}]', 0, 'checkout', 'coordinar', %L)$$, pg_temp.id('A')),
  'variante sin elegir');
select pg_temp.falla(format($$select public.crear_pedido('C','351','','coordinar','','','','',
  '[{"id":"10000000-0000-0000-0000-000000000003","cantidad":1}]', 0, 'checkout', 'coordinar', %L)$$, pg_temp.id('A')),
  'producto oculto');
select pg_temp.falla($$select public.crear_pedido('C','351','','coordinar','','','','',
  '[{"id":"10000000-0000-0000-0000-000000000002","cantidad":1}]', 0)$$, 'pedido sin tienda');
select public.crear_pedido('C','351','c@x.com','envio','C 1','Cba','5000','',
  '[{"id":"10000000-0000-0000-0000-000000000001","variante_id":"30000000-0000-0000-0000-000000000001","cantidad":2},
    {"id":"10000000-0000-0000-0000-000000000002","cantidad":1}]', 1, 'admin', 'mercadopago', pg_temp.id('A')) as numero_p1 \gset
reset role;
insert into ids select 'P1', id from public.pedidos where numero = :numero_p1;

select pg_temp.igual((select subtotal from public.pedidos where id = pg_temp.id('P1')), 25000.00::numeric, 'subtotal de la base');
select pg_temp.igual((select envio from public.pedidos where id = pg_temp.id('P1')), 1500.00::numeric, 'envío de la config de A');
select pg_temp.igual((select total from public.pedidos where id = pg_temp.id('P1')), 26500.00::numeric, 'total');
select pg_temp.igual((select origen from public.pedidos where id = pg_temp.id('P1')), 'checkout', 'origen admin reservado');
select pg_temp.igual((select tienda_id from public.pedidos where id = pg_temp.id('P1')), pg_temp.id('A'), 'pedido de A');
select pg_temp.igual((select stock from public.producto_variantes where nombre = 'S'), 0, 'descuenta la variante');
select pg_temp.igual((select stock from public.productos where id = '10000000-0000-0000-0000-000000000002'), 3, 'descuenta el producto');

set role authenticated;
select pg_temp.como('bbbbbbbb-0000-0000-0000-00000000000b');
select pg_temp.igual((select count(*)::int from public.pedidos), 0, 'Beto no ve pedidos de A');
select pg_temp.como('aaaaaaaa-0000-0000-0000-00000000000a');
select pg_temp.igual((select count(*)::int from public.pedidos), 1, 'Ana ve su pedido');
update public.pedidos set estado = 'cancelado' where id = pg_temp.id('P1');
reset role;
select pg_temp.igual((select stock from public.producto_variantes where nombre = 'S'), 2, 'cancelar devuelve a la variante');
select pg_temp.igual((select stock from public.productos where id = '10000000-0000-0000-0000-000000000002'), 4, 'cancelar devuelve al producto');

-- ------------------------------------------------- Prueba vencida y suscripción
update public.tiendas set prueba_hasta = now() - interval '1 day' where slug = 'tienda-b';
select pg_temp.como('');  -- anon no tiene usuario
set role anon;
select pg_temp.igual((select habilitada from public.tienda_publica('tienda-b')), false, 'B pausada al vencer la prueba');
select pg_temp.igual((select count(*)::int from public.productos where tienda_id = pg_temp.id('B')), 0, 'B pausada no muestra productos');
reset role;
set role authenticated;
select pg_temp.como('cccccccc-0000-0000-0000-00000000000c');
select pg_temp.falla(format($$select public.crear_pedido('C','351','','coordinar','','','','',
  '[{"id":"20000000-0000-0000-0000-000000000001","cantidad":1}]', 0, 'checkout', 'coordinar', %L)$$, pg_temp.id('B')),
  'comprar en tienda pausada');
select pg_temp.como('bbbbbbbb-0000-0000-0000-00000000000b');
select pg_temp.igual((select count(*)::int from public.productos where tienda_id = pg_temp.id('B')), 1, 'Beto sigue viendo su catálogo pausado');
reset role;
update public.tiendas set suscripcion_estado = 'activa' where slug = 'tienda-b';  -- lo hace el webhook
select pg_temp.igual(public.tienda_habilitada(pg_temp.id('B')), true, 'suscripción activa reabre la tienda');
update public.tiendas set suspendida = true where slug = 'tienda-b';
select pg_temp.igual(public.tienda_habilitada(pg_temp.id('B')), false, 'suspensión manual');

-- ----------------------------------------------------- Admin de plataforma
set role authenticated;
select pg_temp.como('dddddddd-0000-0000-0000-00000000000d');
select pg_temp.igual((select count(*)::int from public.tiendas), 2, 'Lucas ve todas las tiendas');
update public.tiendas set suspendida = false where slug = 'tienda-b';
reset role;
select pg_temp.igual((select suspendida from public.tiendas where slug = 'tienda-b'), false, 'Lucas reactiva una tienda');

\echo '✓ Reglas de negocio de la plataforma OK'
