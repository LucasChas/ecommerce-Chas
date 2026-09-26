// Tests de la validación de firma y del mapeo de estados de MercadoPago.
// Correr con:  deno test supabase/functions/_shared/
// (la firma esperada se calculó aparte con HMAC-SHA256 sobre el manifest).
import { firmaValida, mapearEstado } from "./mercadopago.ts";

const FIRMA = "ts=1700000000,v1=7f1ff3f25342131d203eb21411d26d86a8fb8d815a790e6786ba44f31d7e99b3";

Deno.test("firma correcta", async () => {
  if (!(await firmaValida("secreto123", FIRMA, "req-1", "123456"))) throw new Error("debió validar");
});

Deno.test("firma con otro secreto", async () => {
  if (await firmaValida("otro", FIRMA, "req-1", "123456")) throw new Error("no debió validar");
});

Deno.test("id de pago alterado", async () => {
  if (await firmaValida("secreto123", FIRMA, "req-1", "999")) throw new Error("no debió validar");
});

Deno.test("sin header x-signature", async () => {
  if (await firmaValida("secreto123", null, "req-1", "123456")) throw new Error("no debió validar");
});

Deno.test("estados de MP → estados del pedido", () => {
  const r = ["approved", "rejected", "cancelled", "refunded", "charged_back", "in_process"].map(mapearEstado);
  const esperado = ["aprobado", "rechazado", "rechazado", "reembolsado", "reembolsado", "pendiente"];
  if (r.join() !== esperado.join()) throw new Error(r.join());
});
