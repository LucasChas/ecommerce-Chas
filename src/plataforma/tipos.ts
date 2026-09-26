// Tipos de la configuración de la plataforma (plataforma/plataforma.config.mjs).
export interface PlataformaConfig {
  nombre: string
  eslogan: string
  urlPublica: string
  plan: {
    nombre: string
    precioMensual: number
    moneda: string
    diasPrueba: number
    incluye: string[]
  }
  contacto: {
    whatsapp: string
    email: string
    instagram: string
  }
  demoSlug: string
}
