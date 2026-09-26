# Changelog

Versionado semántico del núcleo. Cada versión indica qué migraciones hay que
correr en las tiendas existentes (ver `docs/INSTALACION.md` → "Actualizar una
tienda existente").

## 2.0.0 — 2026-09-26 · Plataforma por suscripción

La maqueta pasa a ser una **plataforma multi-tienda**: los clientes se dan de
alta solos, pagan una suscripción mensual y administran su propia tienda.

### Plataforma
- Landing (`/`) con propuesta, temas, precio, preguntas frecuentes y contacto
  por WhatsApp para proyectos a medida (`plataforma/plataforma.config.mjs`).
- Alta guiada (`/crear`): cuenta con mail administrativo → datos de la tienda
  (dirección web propia, rubro, WhatsApp, Instagram, dirección) → marca (tema,
  color, logo) → prueba gratis o suscripción.
- "Mis tiendas" (`/panel`) con el estado de cada tienda; el admin de la
  plataforma ve todas y puede suspenderlas.
- Suscripción mensual con MercadoPago (Edge Functions `crear-suscripcion` y
  `webhook-suscripciones`). Prueba vencida o suscripción caída → la vitrina se
  pausa sola, sin borrar datos.
- Cada tienda cobra con su propia cuenta de MercadoPago (token guardado en
  `tienda_secretos`, que el front no puede leer).
- Tienda de ejemplo (`supabase/demo.sql`).

### Tiendas
- Cada tienda vive en `/t/<slug>` (o en un dominio propio con
  `VITE_TIENDA_SLUG`), con su panel en `/t/<slug>/admin`.
- Aviso de prueba/suscripción en el panel; "Mi tienda" suma la conexión de
  MercadoPago y los datos de la cuenta.
- Variantes y atributos según el rubro elegido en el alta.
- Sesiones y carritos separados por tienda.

### Base de datos
- Migración `0018_plataforma`: tablas `tiendas`, `tienda_miembros`,
  `plataforma_admins`, `tienda_secretos`; `tienda_id` en categorías, productos,
  pedidos y configuración; RLS por tienda; storage por carpeta de tienda;
  `crear_tienda`, `slug_disponible`, `tienda_publica`, `guardar_token_mp`,
  `crear_pedido` v4. Convierte una instalación de una sola tienda en la
  primera tienda de la plataforma.
- Pruebas SQL de aislamiento entre tiendas, alta, suscripción y permisos.

### Quitado
- `pnpm nueva-tienda`, los seeds por rubro y `VITE_APP_MODE` (reemplazados por
  el alta web, `categorias_iniciales()` y las rutas `/t/<slug>`).

## 1.0.0 — 2026-09-26

Primera versión de la maqueta, a partir de una tienda real en producción.

### Personalización
- Carpeta `tienda/` (config, tema, archivos públicos): el núcleo en `src/` no
  menciona ninguna marca (`pnpm verificar` lo controla).
- Tabla `configuracion` + pestaña **Mi tienda** en el panel: marca, logo, tema,
  colores, contacto y envío editables sin redeploy.
- Temas prearmados (cálido, minimal, oscuro, vibrante) con colores derivados
  por `color-mix()`, tipografías de Google Fonts y ornamentos (festón, onda,
  línea, ninguno).
- Diccionario de textos (`src/i18n/textos.ts`) con trato vos / tú y textos
  pisables por tienda, incluidas las etiquetas de los estados de pedido.
- Moneda, locale y prefijo telefónico por región.
- Features: carrito (modo muestrario), cuentas, pedidos manuales, MercadoPago.

### Catálogo y pedidos
- Variantes con stock propio (talle, color…), atributos por rubro, productos
  ocultos y orden manual por arrastre.
- Costo de envío fijo con envío gratis desde un monto; total calculado por la
  base.
- Pago online con MercadoPago Checkout Pro (Edge Functions
  `crear-preferencia-mp` y `webhook-mercadopago`) y página de resultado.

### Instalación
- `pnpm nueva-tienda` (con rubro, tema y trato), `supabase/instalar.sql`,
  seeds por rubro, `promover_admin(email)`, scripts `db:*` y `fn:*`,
  plantillas de mail generadas.
- CI: build, verificación del núcleo, tests de Edge Functions e instalación
  completa de la base con pruebas de reglas de negocio.

### Migraciones
- `0014_configuracion`, `0015_rubros`, `0016_envio_y_pagos`, `0017_tema`.
- `0005_cuentas` ya no marca administradores por email: usar
  `promover_admin`.
