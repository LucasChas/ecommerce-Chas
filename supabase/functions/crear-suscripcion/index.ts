// ============================================================================
// Edge Function: crear-suscripcion
//
// La dueña de una tienda activa su plan mensual: se crea una suscripción de
// MercadoPago (preapproval) cobrada con la cuenta de MercadoPago de la
// PLATAFORMA, y se devuelve el link para que la autorice.
//
// Seguridad: JWT (default). Solo la dueña o un admin de la tienda (o de la
// plataforma) puede suscribirla. El monto sale del secreto, no del front.
//
// Secretos:
//   MP_PLATAFORMA_TOKEN   Access Token de la cuenta de la plataforma (obligatorio)
//   PLATAFORMA_PRECIO     precio mensual (ej. 15000)
//   PLATAFORMA_MONEDA     default ARS
//   PLATAFORMA_NOMBRE     aparece en el resumen de la tarjeta
//   PLATAFORMA_URL        URL pública de la plataforma (para volver a /panel)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (automáticos)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { crearSuscripcion } from "../_shared/mercadopago.ts";

const LOG = "[crear-suscripcion]";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const token = Deno.env.get("MP_PLATAFORMA_TOKEN");
  const precio = Number(Deno.env.get("PLATAFORMA_PRECIO"));
  if (!token || !(precio > 0)) {
    console.error(`${LOG} faltan MP_PLATAFORMA_TOKEN o PLATAFORMA_PRECIO`);
    return jsonResponse({ error: "Las suscripciones todavía no están configuradas." }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  // Cliente con el JWT de quien llama: RLS decide si puede ver la tienda.
  const cliente = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData } = await cliente.auth.getUser();
  if (!userData.user) return jsonResponse({ error: "Hay que iniciar sesión." }, 401);

  let tiendaId = "";
  try {
    tiendaId = String((await req.json()).tienda_id ?? "");
  } catch {
    // body inválido: cae en "tienda no encontrada"
  }

  // Solo quien administra la tienda la puede leer (RLS de "tiendas").
  const { data: tienda } = await cliente
    .from("tiendas")
    .select("id, nombre, slug, email_admin, suscripcion_estado, suspendida")
    .eq("id", tiendaId)
    .maybeSingle();
  if (!tienda) return jsonResponse({ error: "Tienda no encontrada." }, 404);
  if (tienda.suspendida) return jsonResponse({ error: "La tienda está suspendida: escribinos." }, 409);
  if (tienda.suscripcion_estado === "activa") return jsonResponse({ error: "La suscripción ya está activa." }, 409);

  const plataforma = Deno.env.get("PLATAFORMA_NOMBRE") || "Plataforma";
  const volver = `${(Deno.env.get("PLATAFORMA_URL") || "").replace(/\/$/, "")}/panel`;

  try {
    const sus = await crearSuscripcion(
      token,
      {
        reason: `${plataforma} · ${tienda.nombre}`,
        external_reference: tienda.id,
        // MercadoPago pide el mail del pagador: usamos el de quien la activa.
        payer_email: userData.user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: precio,
          currency_id: Deno.env.get("PLATAFORMA_MONEDA") || "ARS",
        },
        back_url: volver,
        status: "pending",
      },
      `${tienda.id}-${Math.floor(Date.now() / 60000)}`,
    );

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin
      .from("tiendas")
      .update({ mp_preapproval_id: sus.id, suscripcion_estado: "pendiente" })
      .eq("id", tienda.id);

    return jsonResponse({ url: sus.init_point });
  } catch (e) {
    console.error(`${LOG} tienda ${tienda.slug}:`, e instanceof Error ? e.message : e);
    return jsonResponse({ error: "No pudimos iniciar la suscripción en este momento." }, 502);
  }
});
