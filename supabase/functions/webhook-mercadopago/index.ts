// ============================================================================
// Edge Function: webhook-mercadopago
//
// MercadoPago avisa acá cada cambio de un pago. NO confiamos en el cuerpo del
// aviso: con el id del pago consultamos la API de MP (con nuestro token) y
// recién ahí actualizamos pedidos.pago_estado. Además, si está configurado
// MP_WEBHOOK_SECRET, se valida la firma x-signature.
//
// Se despliega SIN verificación JWT (MP no manda un token de Supabase):
//   supabase functions deploy webhook-mercadopago --no-verify-jwt
//
// Secretos: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET (recomendado),
//           SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticos).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { jsonResponse } from "../_shared/http.ts";
import { firmaValida, mapearEstado, obtenerPago } from "../_shared/mercadopago.ts";

const LOG = "[webhook-mercadopago]";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ ok: false }, 405);

  const token = Deno.env.get("MP_ACCESS_TOKEN");
  if (!token) {
    console.error(`${LOG} falta MP_ACCESS_TOKEN`);
    return jsonResponse({ ok: false }, 500);
  }

  // MP manda el aviso con dos formatos: Webhooks (?type=payment&data.id=X o
  // body {type, data:{id}}) e IPN (?topic=payment&id=X). Soportamos ambos.
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // Algunos avisos IPN llegan sin cuerpo.
  }
  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? (body.type as string) ?? "";
  const dataId =
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    String((body.data as { id?: unknown } | undefined)?.id ?? "");

  // Solo nos interesan los pagos (merchant_order y otros: 200 para que MP no reintente).
  if (tipo !== "payment" || !dataId) return jsonResponse({ ok: true, ignorado: tipo || "sin_tipo" });

  const secreto = Deno.env.get("MP_WEBHOOK_SECRET");
  if (secreto) {
    const ok = await firmaValida(secreto, req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId);
    if (!ok) {
      console.warn(`${LOG} firma inválida para pago ${dataId}`);
      return jsonResponse({ ok: false }, 401);
    }
  }

  let pago;
  try {
    pago = await obtenerPago(token, dataId);
  } catch (e) {
    console.error(`${LOG} no se pudo consultar el pago ${dataId}:`, e instanceof Error ? e.message : e);
    // 500: MP reintenta más tarde.
    return jsonResponse({ ok: false }, 500);
  }
  if (!pago.external_reference) return jsonResponse({ ok: true, ignorado: "sin_referencia" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: pedido } = await admin
    .from("pedidos")
    .select("id, numero, total, pago_estado")
    .eq("id", pago.external_reference)
    .maybeSingle();
  if (!pedido) {
    console.warn(`${LOG} pago ${dataId}: pedido ${pago.external_reference} no existe`);
    return jsonResponse({ ok: true, ignorado: "pedido_inexistente" });
  }

  let estado = mapearEstado(pago.status);
  // Defensa extra: un pago aprobado por MENOS del total no marca el pedido pagado.
  if (estado === "aprobado" && Number(pago.transaction_amount) + 0.01 < Number(pedido.total)) {
    console.error(`${LOG} pedido #${pedido.numero}: pagó ${pago.transaction_amount} de ${pedido.total}`);
    estado = "pendiente";
  }
  // Un pago viejo rechazado no pisa uno aprobado (la clienta puede reintentar
  // y MP avisa los dos intentos).
  if (pedido.pago_estado === "aprobado" && estado !== "reembolsado") {
    return jsonResponse({ ok: true, sin_cambios: true });
  }

  const { error } = await admin
    .from("pedidos")
    .update({ pago_estado: estado, mp_payment_id: String(pago.id) })
    .eq("id", pedido.id);
  if (error) {
    console.error(`${LOG} no se pudo actualizar el pedido #${pedido.numero}:`, error.message);
    return jsonResponse({ ok: false }, 500);
  }
  console.log(`${LOG} pedido #${pedido.numero}: pago ${pago.id} → ${estado}`);
  return jsonResponse({ ok: true });
});
