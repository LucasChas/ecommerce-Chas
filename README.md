# ecommerce-chas — maqueta de tienda online personalizable

Tienda online lista para instalar y personalizar para cualquier negocio:
catálogo público con variantes (talle, color…), carrito y checkout con envío y
pago online (MercadoPago), cuentas de clientes con seguimiento de pedidos en
tiempo real, y un panel de administración pensado para usarse desde el
celular.

Nació de un proyecto real (una tienda de ropa de bebé) y se generalizó para
que **el mismo código sirva para cualquier marca**: lo que cambia entre
tiendas vive en una sola carpeta (`tienda/`) y en una tabla de la base que la
dueña edita desde el panel.

- **Frontend:** React 18 + Vite + TypeScript, React Router, CSS plano.
- **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions). Sin servidor propio.
- **Deploy:** Vercel o Netlify (dos deploys desde el mismo repo: tienda pública y panel privado).

---

## Cómo está organizado

```
tienda/                  ← LO ÚNICO QUE SE TOCA POR CLIENTE
  tienda.config.mjs      marca, contacto, región/moneda, colores, features, textos
  tema.css               ajustes finos de estilo (opcional)
  public/                logo, favicon y archivos públicos
src/                     núcleo genérico (igual para todas las tiendas)
  tienda/                config + tabla "configuracion" + presets de tema
  i18n/                  diccionario de textos (vos / tú)
supabase/
  migrations/            esquema versionado (0001 → 0017)
  instalar.sql           todas las migraciones juntas (generado)
  seeds/                 categorías iniciales por rubro
  tests/                 pruebas SQL de reglas de negocio (las corre la CI)
  auth-email-templates/  plantillas de mails de Auth con %TIENDA_*%
  functions/             recibo por mail + MercadoPago (preferencia y webhook)
scripts/                 asistente de alta, generadores y verificador del núcleo
docs/                    guía de instalación, manual del panel y plan
```

### Tres niveles de personalización

| Qué | Dónde | Quién |
|---|---|---|
| Nombre, eslogan, logo, tema, colores, ornamento, contacto, costo de envío | Panel → **Mi tienda** (tabla `configuracion`) | La dueña, sin redeploy |
| Moneda y región, features, rubro (variantes y atributos), trato vos/tú, textos, legales | `tienda/tienda.config.mjs` | Quien instala |
| Estilos puntuales | `tienda/tema.css` | Quien instala |

Lo que se guarda desde el panel **pisa** a lo del archivo campo por campo;
un campo vacío vuelve al valor del archivo.

### Features (planes)

En `tienda.config.mjs → features`:

| Feature | `true` | `false` |
|---|---|---|
| `carrito` | Carrito, checkout y pedidos online | **Modo muestrario**: cada producto tiene su botón de consulta por WhatsApp/Instagram |
| `cuentas` | Registro, login y "Mis pedidos" | Sin cuentas (solo posible sin carrito) |
| `pedidosManuales` | El admin puede cargar pedidos a mano | Se oculta el botón |
| `mercadoPago` | Pago online en el checkout (requiere las Edge Functions) | Solo pago a coordinar |

### Temas

Cuatro presets (`calido`, `minimal`, `oscuro`, `vibrante`) con paleta,
tipografías, radios y ornamento. Encima se puede pisar cualquier valor. El
núcleo usa variables por **función** (`--color-primario`, `--color-fondo`,
`--color-texto`…) en `src/styles/tokens.css`, y los tonos derivados (hover,
fondos suaves, bordes, estados) se calculan con `color-mix()`, así que también
funcionan en el tema oscuro.

### Rubros

Cada producto puede tener **variantes** con stock propio (el nombre —Talle,
Color, Presentación— lo define la tienda) y **atributos** propios del rubro
(Material, Medidas, Ingredientes…). El asistente trae presets para ropa, deco,
alimentos y genérico.

---

## Instalar una tienda nueva

Resumen (el paso a paso, incluido el deploy, está en
[`docs/INSTALACION.md`](docs/INSTALACION.md)):

```bash
pnpm install
pnpm nueva-tienda        # asistente: nombre, contacto, colores, moneda, modo
```

1. Crear el proyecto en Supabase y pegar `supabase/instalar.sql` en el SQL Editor.
2. Crear la cuenta de la dueña en Authentication y correr
   `select public.promover_admin('email');`.
3. Pegar los mails de `supabase/auth-email-templates/generadas/`.
4. `cp .env.example .env` con la URL y la anon key.
5. `pnpm dev` → tienda en `/`, panel en `/admin`.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor local |
| `pnpm build` | Chequeo de tipos + build de producción |
| `pnpm nueva-tienda` | Asistente de alta de una tienda |
| `pnpm emails` | Genera los mails de Auth con los datos de la tienda |
| `pnpm sql:instalacion` | Regenera `supabase/instalar.sql` (correrlo al agregar migraciones) |
| `pnpm verificar` | Controla que el núcleo no tenga datos de la tienda ni colores sueltos, y que `instalar.sql` esté al día |
| `pnpm db:instalar` / `pnpm db:seed` | Instala el esquema / las categorías con `psql` (`SUPABASE_DB_URL`) |
| `pnpm fn:deploy` / `pnpm fn:test` | Despliega / prueba las Edge Functions (Supabase CLI / Deno) |

## Documentación

- [`docs/INSTALACION.md`](docs/INSTALACION.md): alta de una tienda, MercadoPago, deploy y actualizaciones.
- [`docs/MANUAL_ADMIN.md`](docs/MANUAL_ADMIN.md): manual del panel para la dueña.
- [`docs/PLAN_MAQUETA.md`](docs/PLAN_MAQUETA.md): plan de la maqueta y modelo comercial.
- [`CHANGELOG.md`](CHANGELOG.md): versiones del núcleo y migraciones de cada una.
