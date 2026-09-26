// ============================================================================
// Edge Function: webhook-suscripciones
//
// MercadoPago avisa acá los cambios de las suscripciones de la plataforma
// (tópico "subscription_preapproval"). Como en los pagos, NO confiamos en el
// cuerpo: consultamos la suscripción en la API de MP con el token de la
// plataforma y recién ahí actualizamos tiendas.suscripcion_estado.
// Una suscripción activa mantiene la tienda online (tienda_habilitada()).
//
// Deploy SIN verificación JWT:
//   supabase functions deploy webhook-suscripciones --no-verify-jwt
//
// Secretos: MP_PLATAFORMA_TOKEN, MP_PLATAFORMA_WEBHOOK_SECRET (recomendado).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { jsonResponse } from "../_shared/http.ts";
import { firmaValida, mapearSuscripcion, obtenerSuscripcion } from "../_shared/mercadopago.ts";

const LOG = "[webhook-suscripciones]";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResponse({ ok: false }, 405);
  const token = Deno.env.get("MP_PLATAFORMA_TOKEN");
  if (!token) return jsonResponse({ ok: false }, 500);

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // aviso sin cuerpo
  }
  const tipo = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? (body.type as string) ?? "";
  const dataId =
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    String((body.data as { id?: unknown } | undefined)?.id ?? "");

  if (!tipo.startsWith("subscription_preapproval") && tipo !== "preapproval") {
    return jsonResponse({ ok: true, ignorado: tipo || "sin_tipo" });
  }
  if (!dataId) return jsonResponse({ ok: true, ignorado: "sin_id" });

  const secreto = Deno.env.get("MP_PLATAFORMA_WEBHOOK_SECRET");
  if (secreto && !(await firmaValida(secreto, req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId))) {
    console.warn(`${LOG} firma inválida para ${dataId}`);
    return jsonResponse({ ok: false }, 401);
  }

  let sus;
  try {
    sus = await obtenerSuscripcion(token, dataId);
  } catch (e) {
    console.error(`${LOG} no se pudo consultar ${dataId}:`, e instanceof Error ? e.message : e);
    return jsonResponse({ ok: false }, 500); // MP reintenta
  }
  if (!sus.external_reference) return jsonResponse({ ok: true, ignorado: "sin_referencia" });

  const estado = mapearSuscripcion(sus.status);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Solo la suscripción vigente de la tienda (la última que creó) cambia su
  // estado: un aviso atrasado de un intento viejo no pisa al actual.
  const { error } = await admin
    .from("tiendas")
    .update({ suscripcion_estado: estado })
    .eq("id", sus.external_reference)
    .eq("mp_preapproval_id", sus.id);
  if (error) {
    console.error(`${LOG} tienda ${sus.external_reference}:`, error.message);
    return jsonResponse({ ok: false }, 500);
  }
  console.log(`${LOG} tienda ${sus.external_reference}: suscripción ${sus.id} → ${estado}`);
  return jsonResponse({ ok: true });
});
