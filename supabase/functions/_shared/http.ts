// ============================================================================
// Helpers HTTP compartidos por las Edge Functions (Supabase empaqueta la
// carpeta _shared junto a cada función que la importa).
// ============================================================================

// CORS: las funciones que llama el navegador (supabase.functions.invoke)
// necesitan responder el preflight OPTIONS con estos headers.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
