# Puesta en marcha de la plataforma

Esto se hace **una sola vez**: después, cada cliente crea su tienda solo desde
la landing (`/crear`) y paga su suscripción con MercadoPago.

Necesitás: un proyecto de [Supabase](https://supabase.com), una cuenta de
[MercadoPago](https://www.mercadopago.com.ar/developers) **de la plataforma**
(donde cobrás las suscripciones) y un hosting para el front
([Vercel](https://vercel.com) o [Netlify](https://netlify.com)).

> **Planes:** revisá los límites vigentes. Con muchas tiendas en una sola base
> conviene el plan pago de Supabase (el gratis se pausa por inactividad), y el
> plan Hobby de Vercel no admite uso comercial.

---

## 1. Tu marca y tu precio

Editá `plataforma/plataforma.config.mjs`: nombre de la plataforma, eslogan,
URL pública, precio mensual, días de prueba gratis, WhatsApp y mail de
contacto (el WhatsApp es el del botón "¿Necesitás algo a medida?").

La estética base de todas las tiendas (la de Pecora) está en
`tienda/tienda.config.mjs`; cada tienda después elige tema, colores y logo.

> Si cambiás los días de prueba, cambiá también el default de
> `tiendas.prueba_hasta` en `supabase/migrations/0018_plataforma.sql`.

## 2. Base de datos

1. Creá el proyecto en Supabase y anotá **Project URL** y **anon key**
   (Project Settings → API).
2. **SQL Editor**: pegá `supabase/instalar.sql` y ejecutá. Crea todo: tiendas,
   permisos por tienda, productos, pedidos, stock, envío, pagos.
3. Creá **tu** usuario (Authentication → Users → Add user) y hacete admin de la
   plataforma:
   ```sql
   select public.promover_admin('tu-email@ejemplo.com');
   ```
   Como admin ves todas las tiendas en `/panel` y podés suspenderlas.
4. Tienda de ejemplo para la landing: pegá `supabase/demo.sql` (crea `/t/demo`).
   Después entrá a `/t/demo/admin` y subile fotos.
5. **Authentication → Providers → Email:** **Enable sign up** activado (se
   registran dueñas y clientes). *Confirm email* a elección: si está activo,
   el link del mail devuelve a la persona a donde se registró.
6. **Authentication → URL Configuration:** Site URL = la URL de la plataforma,
   y en Redirect URLs agregá `https://tu-plataforma.com/**`.
7. **Authentication → Emails:** `pnpm emails` genera las plantillas con la
   marca de la plataforma en `supabase/auth-email-templates/generadas/`.

Alternativa por consola (con la connection string de Project Settings →
Database en `SUPABASE_DB_URL`): `pnpm db:instalar` y `pnpm db:demo`.

## 3. Cobros de la plataforma (suscripciones)

1. En MercadoPago, con la cuenta de la plataforma → **Tus integraciones** →
   creá una aplicación y copiá el **Access Token de producción**.
2. En **Webhooks** de esa aplicación, URL:
   `https://<ref>.supabase.co/functions/v1/webhook-suscripciones`, evento
   **Planes y suscripciones**. Copiá la clave secreta.
3. Funciones y secretos (Supabase CLI):
   ```bash
   supabase login
   supabase link --project-ref <ref>
   supabase secrets set \
     MP_PLATAFORMA_TOKEN=APP_USR-... \
     MP_PLATAFORMA_WEBHOOK_SECRET=... \
     PLATAFORMA_PRECIO=15000 PLATAFORMA_MONEDA=ARS \
     PLATAFORMA_NOMBRE="Tiendas Chas" PLATAFORMA_URL=https://tu-plataforma.com
   pnpm fn:deploy
   ```
   `PLATAFORMA_PRECIO` es lo que se cobra de verdad (la landing muestra el de
   `plataforma.config.mjs`: mantenelos iguales).

Cómo funciona: la dueña toca **Activar suscripción** (al final del alta, en
`/panel` o en el aviso de su panel) → MercadoPago → autoriza el débito
mensual. El webhook consulta la suscripción en la API de MP y marca la tienda
como activa. Si vence la prueba sin suscripción, o la suscripción se pausa o
cancela, la vitrina se pausa sola (los datos no se borran) y vuelve al
reactivarla.

## 4. Cobros de cada tienda

No hay nada que configurar de tu lado: cada dueña conecta **su** cuenta de
MercadoPago desde su panel → **Mi tienda → Cobros con MercadoPago** (pega su
Access Token). Sus ventas van directo a su cuenta. El token queda en una tabla
que solo leen las funciones del servidor. Sin MercadoPago conectado, su
checkout ofrece solo "coordinar el pago por WhatsApp".

El mail de recibo de compra (`enviar-recibo-pedido`) es opcional; su
configuración está en [`supabase/functions/README.md`](../supabase/functions/README.md).

## 5. Deploy del front

Un solo deploy: build `pnpm run build`, output `dist`, variables
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Los rewrites de SPA ya están
en `vercel.json`, `netlify.toml` y `tienda/public/_redirects`.

| Ruta | Qué es |
|---|---|
| `/` | Landing |
| `/crear` | Alta de una tienda |
| `/ingresar`, `/panel` | Login y "Mis tiendas" de las dueñas (y tu vista de admin) |
| `/t/<slug>` | Vitrina de cada tienda |
| `/t/<slug>/admin` | Panel de cada tienda |

**Dominio propio para un cliente** (opcional, ej. un plan superior): un deploy
aparte del mismo repo con `VITE_TIENDA_SLUG=<slug>` sirve esa tienda en la raíz
de su dominio.

## 6. Probar en local

```bash
pnpm install
cp .env.example .env     # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
pnpm dev
```

Abrí <http://localhost:5173/>, creá una tienda desde "Crear tienda" y entrá a
su panel. Las suscripciones y los cobros online necesitan las funciones
desplegadas (paso 3).

## Migrar Pecora a la plataforma

La migración 0018 convierte una instalación de una sola tienda (0001-0017 con
datos) en la primera tienda de la plataforma: sus productos, pedidos y
configuración quedan en una tienda con suscripción activa, y sus admins pasan a
ser dueños de esa tienda y admins de la plataforma. Hacé un backup antes.
