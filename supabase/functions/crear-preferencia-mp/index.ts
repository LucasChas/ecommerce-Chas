// ============================================================================
// Edge Function: crear-preferencia-mp
//
// La llama el checkout (supabase.functions.invoke) después de crear_pedido,
// cuando la clienta eligió pagar con MercadoPago. Arma la preferencia de
// Checkout Pro CON LOS DATOS DE LA BASE (ítems, precios, envío: nunca los del
// front) y devuelve el link de pago al que se redirige.
//
// Seguridad:
//   - Se despliega con verificación JWT (default): solo usuarios logueados.
//   - Solo se puede pagar un pedido PROPIO, con método 'mercadopago', que no
//     esté pagado ni cancelado.
//
// Secretos:
//   MP_ACCESS_TOKEN  (obligatorio; el de prueba empieza con TEST-)
//   MP_SANDBOX       (opcional, "true" para usar sandbox_init_point)
//   STORE_URL        (respaldo si configuracion.url_sitio está vacío)
//   STORE_CURRENCY   (opcional, default ARS)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (automáticos)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { crearPreferencia } from "../_shared/mercadopago.ts";

const LOG = "[crear-preferencia-mp]";

interface Item {
  nombre: string;
  precio: number;
  cantidad: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const token = Deno.env.get("MP_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!token) {
    console.error(`${LOG} falta MP_ACCESS_TOKEN`);
    return jsonResponse({ error: "El pago online no está configurado." }, 500);
  }

  // Quién llama: el usuario del JWT (no un id que venga en el body).
  const auth = req.headers.get("Authorization") ?? "";
  const cliente = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userError } = await cliente.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "Hay que iniciar sesión." }, 401);

  let numero: number;
  try {
    numero = Number((await req.json()).numero);
  } catch {
    return jsonResponse({ error: "Pedido inválido." }, 400);
  }
  if (!Number.isInteger(numero) || numero <= 0) return jsonResponse({ error: "Pedido inválido." }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: pedido, error } = await admin
    .from("pedidos")
    .select("id, numero, user_id, email, items, envio, total, estado, metodo_pago, pago_estado")
    .eq("numero", numero)
    .maybeSingle();
  if (error) {
    console.error(`${LOG} error leyendo pedido #${numero}:`, error.message);
    return jsonResponse({ error: "No pudimos leer el pedido." }, 500);
  }
  if (!pedido || pedido.user_id !== userData.user.id) return jsonResponse({ error: "Pedido no encontrado." }, 404);
  if (pedido.metodo_pago !== "mercadopago") return jsonResponse({ error: "Este pedido no se paga online." }, 400);
  if (pedido.pago_estado === "aprobado") return jsonResponse({ error: "Este pedido ya está pagado." }, 409);
  if (pedido.estado === "cancelado") return jsonResponse({ error: "Este pedido está cancelado." }, 409);

  const { data: cfg } = await admin.from("configuracion").select("nombre_tienda, url_sitio").maybeSingle();
  const storeUrl = (cfg?.url_sitio || Deno.env.get("STORE_URL") || "").replace(/\/$/, "");
  const moneda = Deno.env.get("STORE_CURRENCY") || "ARS";
  const volver = `${storeUrl}/pago/resultado?numero=${pedido.numero}`;

  const items = (pedido.items as Item[]).map((i) => ({
    title: i.nombre,
    quantity: i.cantidad,
    unit_price: Number(i.precio),
    currency_id: moneda,
  }));
  if (Number(pedido.envio) > 0) {
    items.push({ title: "Envío", quantity: 1, unit_price: Number(pedido.envio), currency_id: moneda });
  }

  try {
    const pref = await crearPreferencia(
      token,
      {
        items,
        payer: pedido.email ? { email: pedido.email } : undefined,
        external_reference: pedido.id,
        statement_descriptor: (cfg?.nombre_tienda || "").slice(0, 22) || undefined,
        notification_url: `${supabaseUrl}/functions/v1/webhook-mercadopago`,
        back_urls: { success: volver, pending: volver, failure: volver },
        auto_return: "approved",
      },
      // Idempotencia por pedido + minuto: un doble click no crea dos preferencias.
      `${pedido.id}-${Math.floor(Date.now() / 60000)}`,
    );
    await admin.from("pedidos").update({ mp_preference_id: pref.id }).eq("id", pedido.id);
    const sandbox = Deno.env.get("MP_SANDBOX") === "true";
    return jsonResponse({ url: sandbox ? pref.sandbox_init_point : pref.init_point });
  } catch (e) {
    console.error(`${LOG} pedido #${numero}:`, e instanceof Error ? e.message : e);
    return jsonResponse({ error: "No pudimos iniciar el pago en este momento." }, 502);
  }
});
