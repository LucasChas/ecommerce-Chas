// Dirección web de una tienda a partir de su nombre (misma regla que
// slugify() en la base): minúsculas, sin tildes, guiones entre palabras.
export function aSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

export const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
