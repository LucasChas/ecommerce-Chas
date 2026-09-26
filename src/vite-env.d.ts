/// <reference types="vite/client" />

// Tipado de las variables de entorno que usa la app (autocompletado + chequeo).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // Deploy dedicado a una tienda (dominio propio). Ver lib/contexto.ts.
  readonly VITE_TIENDA_SLUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Permite importar imágenes como assets (URL string).
declare module '*.svg' {
  const src: string
  export default src
}
