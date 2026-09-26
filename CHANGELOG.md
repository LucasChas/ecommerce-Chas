# Changelog

Versionado semántico del núcleo. Cada versión indica qué migraciones hay que
correr en las tiendas existentes (ver `docs/INSTALACION.md` → "Actualizar una
tienda existente").

## 1.0.0 — 2026-09-26

Primera versión de la maqueta, a partir de Pecora 2.0.

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
