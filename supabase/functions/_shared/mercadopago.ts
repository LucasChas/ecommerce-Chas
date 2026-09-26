// ============================================================================
// MercadoPago: llamadas a la API y validación de la firma del webhook.
// Docs: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro
// ============================================================================

const API = "https://api.mercadopago.com";

export type EstadoPago = "pendiente" | "aprobado" | "rechazado" | "reembolsado";

/** Estado de un pago de MP → estado de pago del pedido. */
export function mapearEstado(statusMp: string): EstadoPago {
  switch (statusMp) {
    case "approved":
      return "aprobado";
    case "rejected":
    case "cancelled":
      return "rechazado";
    case "refunded":
    case "charged_back":
      return "reembolsado";
    default:
      // pending, in_process, authorized, in_mediation...
      return "pendiente";
  }
}

export async function crearPreferencia(token: string, preferencia: unknown, idempotencia: string) {
  const res = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencia,
    },
    body: JSON.stringify(preferencia),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`MP ${res.status}: ${JSON.stringify(data)}`);
  return data as { id: string; init_point: string; sandbox_init_point: string };
}

export interface Suscripcion {
  id: string;
  status: string; // pending | authorized | paused | cancelled
  external_reference: string | null;
  init_point?: string;
}

/** Crea una suscripción mensual (preapproval) sin plan asociado. */
export async function crearSuscripcion(token: string, cuerpo: unknown, idempotencia: string) {
  const res = await fetch(`${API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencia,
    },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`MP ${res.status}: ${JSON.stringify(data)}`);
  return data as Suscripcion;
}

export async function obtenerSuscripcion(token: string, id: string): Promise<Suscripcion> {
  const res = await fetch(`${API}/preapproval/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`MP ${res.status}: ${JSON.stringify(data)}`);
  return data as Suscripcion;
}

/** Estado de una suscripción de MP → estado de la suscripción de la tienda. */
export function mapearSuscripcion(statusMp: string): "pendiente" | "activa" | "pausada" | "cancelada" {
  switch (statusMp) {
    case "authorized":
      return "activa";
    case "paused":
      return "pausada";
    case "cancelled":
      return "cancelada";
    default:
      return "pendiente";
  }
}

export interface PagoMp {
  id: number;
  status: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
}

export async function obtenerPago(token: string, id: string): Promise<PagoMp> {
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`MP ${res.status}: ${JSON.stringify(data)}`);
  return data as PagoMp;
}

async function hmacSha256Hex(secreto: string, mensaje: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(mensaje));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Valida el header x-signature de MP ("ts=...,v1=...") con la clave secreta
 * del webhook (panel de MP → Tus integraciones → Webhooks).
 * Manifest: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 */
export async function firmaValida(
  secreto: string,
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string,
): Promise<boolean> {
  if (!xSignature) return false;
  const partes = Object.fromEntries(
    xSignature.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
  );
  const ts = partes["ts"];
  const v1 = partes["v1"];
  if (!ts || !v1) return false;
  // MP firma el id en minúsculas cuando es alfanumérico.
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifest = `id:${id};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;
  const esperado = await hmacSha256Hex(secreto, manifest);
  // Comparación de largo fijo para no filtrar información por tiempos.
  if (esperado.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
