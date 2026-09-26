# Instalación de una tienda nueva

Tiempo estimado: menos de una hora. Necesitás una cuenta de
[Supabase](https://supabase.com) y una de [Vercel](https://vercel.com) o
[Netlify](https://netlify.com). Para cobrar online, además, una cuenta de
[MercadoPago](https://www.mercadopago.com.ar/developers) del cliente.

> **Cuentas y planes:** conviene que el proyecto de Supabase quede a nombre
> del cliente (vos como miembro). Revisá los límites vigentes de los planes
> gratuitos: Supabase limita la cantidad de proyectos gratis y los pausa por
> inactividad, y el plan Hobby de Vercel no admite uso comercial.

---

## 1. Personalizar la tienda

```bash
pnpm install
pnpm nueva-tienda
```

El asistente pregunta nombre, eslogan, URL, WhatsApp, Instagram, email,
**rubro** (genérico, ropa, deco, alimentos), **tema** (cálido, minimal,
oscuro, vibrante), colores, **trato** (vos / tú), moneda, locale y si vende
online (carrito) o es solo muestrario. Completa `tienda/tienda.config.mjs`,
copia las categorías del rubro a `supabase/seed.sql`, arma
`supabase/instalar.sql` y genera los mails de Auth.

Después, a mano si hace falta (todo en `tienda/tienda.config.mjs`):

| Qué | Dónde |
|---|---|
| Logo y favicon | Archivos en `tienda/public/` y `logoUrl: '/logo.png'`. Reemplazá `tienda/public/favicon.svg`. El logo también se sube desde el panel → **Mi tienda**. |
| Pago online | `features.mercadoPago: true` + paso 3. |
| Envío | `envio.costo` / `envio.gratisDesde` (o desde **Mi tienda**). `null` = a coordinar. |
| Variantes y datos del rubro | `catalogo.etiquetaVariante` (Talle, Color…) y `catalogo.atributos` (Material, Medidas…). |
| Tipografías y adorno | `tema.fuenteTitulos` / `tema.fuenteTexto` (Google Fonts) y `tema.ornamento` (`festón`, `onda`, `línea`, `ninguno`). |
| Textos | `textos` (mensajes de WhatsApp, éxito del pedido) e `idioma.textos` para pisar cualquier texto de `src/i18n/textos.ts` (por ejemplo los nombres de los estados). |
| Estilos puntuales | `tienda/tema.css`. |
| Legales | `/terminos` y `/privacidad` usan nombre, URL y email. Son un modelo: el cliente los revisa con su asesor legal. |

## 2. Base de datos (Supabase)

1. Creá un proyecto nuevo y anotá, en **Project Settings → API**, la
   **Project URL** y la **anon public key**.
2. Instalá el esquema, de una de estas dos formas:
   - **SQL Editor → New query**: pegá todo `supabase/instalar.sql` y ejecutá;
     después pegá `supabase/seed.sql` (categorías iniciales).
   - O por consola, con la connection string de **Project Settings →
     Database** en `SUPABASE_DB_URL`:
     ```bash
     export SUPABASE_DB_URL="postgresql://postgres:...@db.xxxx.supabase.co:5432/postgres"
     pnpm db:instalar && pnpm db:seed
     ```
3. **Authentication → Users → Add user**: creá la cuenta de la dueña (email +
   contraseña, "Auto Confirm"). Después, en el SQL Editor:

   ```sql
   select public.promover_admin('email-de-la-duena@ejemplo.com');
   ```

   Devuelve `true` si encontró la cuenta.
4. **Authentication → Providers → Email:**
   - Con `features.carrito = true`, dejá **Enable Sign up** activado (los
     clientes se registran para comprar).
   - En modo muestrario podés desactivarlo.
5. **Authentication → Emails → Templates:** pegá los HTML de
   `supabase/auth-email-templates/generadas/` en "Confirm signup" y "Reset
   Password" (y "Password Changed" en Notifications, si lo activás).
6. **Authentication → URL Configuration:** Site URL = la URL pública de la
   tienda; agregala también en Redirect URLs.

## 3. Edge Functions (mail de recibo y MercadoPago)

Con la [Supabase CLI](https://supabase.com/docs/guides/cli) instalada:

```bash
supabase login
supabase init            # solo si no existe supabase/config.toml (no toca las migraciones)
supabase link --project-ref <ref-del-proyecto>
pnpm fn:deploy           # despliega las tres funciones con los flags correctos
```

### Mail de recibo (opcional)

`enviar-recibo-pedido` manda el comprobante al crear un pedido. El paso a
paso (Gmail OAuth, secretos y Vault) está en
[`supabase/functions/README.md`](../supabase/functions/README.md).

### MercadoPago (opcional)

1. En MercadoPago → **Tus integraciones**, creá una aplicación (Checkout Pro)
   y copiá el **Access Token** (el de prueba empieza con `TEST-`).
2. En **Webhooks**, configurá la URL
   `https://<ref>.supabase.co/functions/v1/webhook-mercadopago`, evento
   **Pagos**, y copiá la **clave secreta**.
3. Cargá los secretos:
   ```bash
   supabase secrets set MP_ACCESS_TOKEN=TEST-... MP_WEBHOOK_SECRET=... \
     STORE_URL=https://mi-tienda.com STORE_CURRENCY=ARS MP_SANDBOX=true
   ```
   (`MP_SANDBOX=true` solo mientras probás con credenciales de prueba.)
4. En `tienda.config.mjs`: `features.mercadoPago: true`.

Cómo funciona: el checkout crea el pedido (con el stock reservado) y pide el
link de pago a `crear-preferencia-mp`, que arma la preferencia con los precios
**de la base**. MercadoPago avisa a `webhook-mercadopago`, que valida la
firma, consulta el pago en la API de MP y recién ahí marca el pedido como
pagado. Si el pago se rechaza, el pedido queda reservado y el cliente puede
reintentar desde "Mis pedidos"; si no vuelve, la dueña lo cancela desde el
panel y el stock se devuelve solo.

## 4. Probar en local

```bash
cp .env.example .env     # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
pnpm dev
```

- Tienda: <http://localhost:5173/>
- Panel: <http://localhost:5173/admin>

## 5. Deploy: dos URLs (tienda pública + panel privado)

`VITE_APP_MODE` define qué expone cada deploy, así se crean **dos proyectos
desde el mismo repo**:

| Proyecto | `VITE_APP_MODE` | Qué muestra |
|---|---|---|
| Tienda (pública) | `catalog` | Catálogo, carrito, cuentas. `/admin` no existe. |
| Panel (privado) | `admin` | Solo el panel, en la raíz `/` |

En los dos: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, build
`pnpm run build`, output `dist`. Los rewrites de SPA ya están en `vercel.json`,
`netlify.toml` y `tienda/public/_redirects`.

> La privacidad real del panel la dan el login y RLS: aunque alguien encuentre
> la URL, sin una cuenta con rol admin no puede hacer nada.

## 6. Entregar

- Pasale a la dueña la URL del panel, su usuario y el
  [manual del panel](MANUAL_ADMIN.md).
- Mostrale la pestaña **Mi tienda**: desde ahí cambia nombre, logo, tema,
  colores, contacto y envío sin depender de vos.

## Actualizar una tienda existente

1. Traé los cambios del núcleo (`git merge upstream/main` si la tienda vive en
   su propio repo; ver [`PLAN_MAQUETA.md`](PLAN_MAQUETA.md) §7).
2. Leé el [`CHANGELOG.md`](../CHANGELOG.md): dice qué migraciones nuevas hay.
3. Corré solo esas migraciones (`supabase/migrations/00NN_*.sql`, en orden) en
   el SQL Editor, o con `pnpm db:push` si la tienda usa la CLI.
4. `pnpm fn:deploy` si cambiaron las funciones, y redeploy del front.
