# Instalación de una tienda nueva

Tiempo estimado: menos de una hora. Necesitás una cuenta de
[Supabase](https://supabase.com) y una de [Vercel](https://vercel.com) o
[Netlify](https://netlify.com).

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
colores, moneda, locale y si vende online (carrito) o es solo muestrario.
Completa `tienda/tienda.config.mjs`, arma `supabase/instalar.sql` y genera los
mails de Auth.

Después, a mano si hace falta:

- **Logo y favicon:** poné los archivos en `tienda/public/` (por ejemplo
  `logo.png`) y en la config `logoUrl: '/logo.png'`. Reemplazá
  `tienda/public/favicon.svg`. El logo también se puede subir más tarde desde
  el panel → **Mi tienda**.
- **Textos de WhatsApp y de confirmación:** `textos` en la config.
- **Fuentes y ornamento:** `tema.fuenteTitulos`, `tema.fuenteTexto` (familias
  de Google Fonts) y `tema.ornamento` (`'festón'` o `'ninguno'`).
- **Legales:** `/terminos` y `/privacidad` se arman con nombre, URL y email de
  la config. Son un modelo: el cliente debe revisarlos con su asesor legal.

## 2. Base de datos (Supabase)

1. Creá un proyecto nuevo y anotá, en **Project Settings → API**, la
   **Project URL** y la **anon public key**.
2. **SQL Editor → New query**: pegá todo `supabase/instalar.sql` y ejecutá.
   Crea tablas, políticas RLS, el bucket de imágenes, triggers, Realtime y la
   tabla `configuracion`.
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

### Mail de recibo de compra (opcional)

La Edge Function `enviar-recibo-pedido` manda el comprobante por mail al
crear un pedido. El paso a paso (Gmail OAuth, secretos y Vault) está en
[`supabase/functions/README.md`](../supabase/functions/README.md). Toma nombre,
logo, URL y WhatsApp de la tabla `configuracion`.

## 3. Probar en local

```bash
cp .env.example .env     # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
pnpm dev
```

- Tienda: <http://localhost:5173/>
- Panel: <http://localhost:5173/admin>

## 4. Deploy: dos URLs (tienda pública + panel privado)

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

## 5. Entregar

- Pasale a la dueña la URL del panel y su usuario.
- Mostrale la pestaña **Mi tienda**: desde ahí cambia nombre, logo, colores y
  contacto sin depender de vos.

## Actualizar una tienda existente

Cuando el núcleo suma migraciones nuevas, corré en el SQL Editor solo las
que la tienda todavía no tiene (`supabase/migrations/00NN_*.sql`, en orden).
