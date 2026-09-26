# Hornero — plataforma de tiendas online por suscripción

*Construí tu propio lugar.* Como el hornero, que levanta su casa con sus
manos, cualquier negocio crea acá su tienda online en minutos y la personaliza
con su logo, sus colores y sus productos. Paga una **suscripción mensual** y cobra sus ventas con **su propia
cuenta de MercadoPago**.

- **Landing** con la propuesta, el precio y contacto para proyectos a medida.
- **Alta autoservicio** (`/crear`): mail administrativo, datos de la tienda
  (teléfono, dirección, Instagram, rubro), marca (tema, color, logo).
- **Prueba gratis** y **suscripción** con MercadoPago; si no se paga, la tienda
  se pausa sola (sin perder datos).
- **Cada tienda** en `/t/<su-nombre>`: catálogo con variantes, carrito,
  checkout con envío y pago online, cuentas de clientes, pedidos en tiempo real
  y un panel pensado para el celular.

**Stack:** React 18 + Vite + TypeScript, CSS plano · Supabase (Postgres + Auth +
Storage + Realtime + Edge Functions), sin servidor propio · Vercel o Netlify.

---

## Cómo está organizado

```
plataforma/plataforma.config.mjs   TU marca: nombre, precio, días de prueba, contacto
tienda/                            estética base de todas las tiendas
src/
  plataforma/                      landing, alta, "Mis tiendas", suscripción
  tienda/                          carga la tienda de la URL + temas + rubros
  pages/, components/              vitrina y panel de cada tienda
  lib/contexto.ts                  ¿plataforma o tienda? (según la URL)
supabase/
  migrations/                      0001 → 0018 (0018 = multi-tienda)
  instalar.sql                     todo junto (generado)
  demo.sql                         tienda de ejemplo /t/demo
  tests/                           pruebas SQL (aislamiento, stock, suscripción)
  functions/                       suscripción, cobros de tiendas, recibo por mail
docs/                              puesta en marcha, manual del panel, plan
```

## Rutas

| Ruta | Qué es |
|---|---|
| `/` | Landing de la plataforma |
| `/crear` | Alta de una tienda nueva |
| `/ingresar`, `/panel` | Login y "Mis tiendas" (el admin de la plataforma ve todas) |
| `/t/<slug>` | Vitrina de una tienda |
| `/t/<slug>/admin` | Panel de esa tienda |

## Quién configura qué

| Qué | Dónde | Quién |
|---|---|---|
| Nombre de la plataforma, precio, prueba gratis, contacto | `plataforma/plataforma.config.mjs` | Vos |
| Estética base, textos y features de todas las tiendas | `tienda/tienda.config.mjs`, `tienda/tema.css` | Vos |
| Nombre, logo, tema, colores, contacto, envío de una tienda | Panel de la tienda → **Mi tienda** | Cada dueña |
| Su cuenta de MercadoPago para cobrar | Panel → **Mi tienda → Cobros** | Cada dueña |
| Rubro (talles, colores, atributos, categorías iniciales) | Alta (`/crear`) | Cada dueña |

## Empezar

```bash
pnpm install
cp .env.example .env     # VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
pnpm dev                 # http://localhost:5173
```

La base se instala pegando `supabase/instalar.sql` en el SQL Editor de
Supabase. El paso a paso completo (tu usuario admin, tienda demo, MercadoPago,
deploy) está en [`docs/INSTALACION.md`](docs/INSTALACION.md).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` / `pnpm build` | Servidor local / build de producción |
| `pnpm verificar` | Núcleo sin datos de ninguna tienda ni colores sueltos, `instalar.sql` al día |
| `pnpm sql:instalacion` | Regenera `supabase/instalar.sql` (al agregar migraciones) |
| `pnpm db:instalar` / `pnpm db:demo` | Instala el esquema / la tienda demo con `psql` (`SUPABASE_DB_URL`) |
| `pnpm fn:deploy` / `pnpm fn:test` | Despliega / prueba las Edge Functions |
| `pnpm emails` | Plantillas de mail de Auth con la marca de la plataforma |

## Documentación

- [`docs/INSTALACION.md`](docs/INSTALACION.md): puesta en marcha de la plataforma.
- [`docs/MANUAL_ADMIN.md`](docs/MANUAL_ADMIN.md): manual del panel para las dueñas.
- [`docs/PLAN_MAQUETA.md`](docs/PLAN_MAQUETA.md): plan y modelo comercial.
- [`CHANGELOG.md`](CHANGELOG.md): versiones y migraciones.
