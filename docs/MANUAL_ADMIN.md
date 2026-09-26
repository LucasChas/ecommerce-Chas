# Manual del panel

Guía corta para la persona que administra la tienda. El panel está pensado
para usarse desde el celular.

## Entrar

Entrá a la plataforma → **Ingresar** con tu mail administrativo, y en **Mis
tiendas** tocá **Administrar**. También podés ir directo a
`/t/<tu-tienda>/admin`. Para salir, tocá el círculo con tu inicial.

## Tu suscripción

- Arriba del panel ves cuántos días de prueba gratis te quedan. Tocá
  **Activar** para suscribirte con MercadoPago (débito mensual automático).
- Si la prueba vence sin suscripción, tu tienda se **pausa**: tus clientes ven
  un aviso, pero no se borra nada. Al activar la suscripción vuelve tal cual.
- La suscripción se cancela desde tu cuenta de MercadoPago.

## Productos

- **Agregar:** botón **+** abajo a la derecha. Cargá fotos (la primera es la
  portada; se reordenan arrastrando), nombre, categoría, descripción, precio y
  stock.
- **Editar rápido:** el precio y el stock se cambian directo en la tarjeta del
  producto; se guarda al salir del campo.
- **Opciones (talles, colores…):** en **Editar foto y datos** → *+ Agregar*.
  Cada opción tiene su propio stock y el total se calcula solo. Si un producto
  tiene opciones, su stock se edita por opción (en la tarjeta queda bloqueado).
- **Ocultar sin borrar:** apagá **Visible en la tienda**. El producto queda
  guardado con la etiqueta *Oculto* y los clientes no lo ven.
- **Ordenar el catálogo:** arrastrá la manija **⋮⋮** de cada tarjeta (con la
  lista completa, sin búsqueda ni filtros). El catálogo público usa ese orden.
- **Categorías:** en el formulario de producto → *Gestionar categorías*. No se
  puede borrar una categoría que todavía tiene productos.

## Pedidos

- Los pedidos nuevos llegan solos (con un número en la pestaña).
- Cambiá el estado desde el selector de cada pedido: el cliente lo ve al
  instante en "Mis pedidos".
- **Cancelar** un pedido devuelve el stock automáticamente. Reactivarlo lo
  vuelve a descontar (si ya no hay stock, no deja).
- **Pago online:** los pedidos pagados con MercadoPago muestran *MP · Pagado*,
  *Pago pendiente* o *Pago rechazado*. Solo MercadoPago puede marcar un pago
  como aprobado. Un pedido con pago rechazado sigue reservando stock: si el
  cliente no reintenta, cancelalo.
- **Pedido manual** (ventas por WhatsApp o en persona): botón **+** en la
  pestaña Pedidos. Descuenta stock igual que una compra web.
- **Papelera:** borrar un pedido lo manda a la papelera (filtro *Papelera*);
  desde ahí se restaura o se elimina para siempre.
- El botón de WhatsApp de cada pedido abre el chat con el cliente.

## Mi tienda

- **Marca:** nombre, eslogan y logo (PNG o SVG de menos de 1 MB). Sin logo, se
  muestra el nombre.
- **Tema:** elegí uno de los cuatro estilos y, si querés, retocá los colores.
  La vista previa muestra cómo quedan antes de guardar.
- **Contacto:** WhatsApp (con código de país, solo números), Instagram, email
  y dirección del sitio.
- **Envío a domicilio:** costo fijo y, opcional, un monto desde el cual es
  gratis. Vacío = el envío se coordina aparte.
- **Cobros con MercadoPago:** pegá el Access Token de producción de tu cuenta
  (MercadoPago → Tus integraciones → tu aplicación → Credenciales de
  producción). Desde ese momento tus clientes pueden pagar online y la plata
  va directo a tu cuenta. Se puede cambiar o desconectar cuando quieras.
- **Datos de la cuenta:** tu mail administrativo, teléfono y dirección (no son
  públicos).

Tocá **Guardar cambios**: se ven en la tienda enseguida.
