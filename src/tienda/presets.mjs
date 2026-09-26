// ============================================================================
// Presets de tema: paleta + tipografías + forma + ornamento, listos para usar.
//
// Una tienda elige uno (tienda.config.mjs → tema.preset, o desde el admin →
// "Mi tienda") y puede pisar cualquier valor puntual (ej. solo el color
// principal). Es .mjs para que también lo usen los scripts de Node.
//
// "variables" son tokens CSS extra que el preset necesita (ej. el oscuro
// cambia el color de las tarjetas y de las sombras).
// ============================================================================

/** @typedef {import('./tipos').PresetTema} PresetTema */
/** @typedef {import('./tipos').TemaResuelto} TemaResuelto */

/** @type {Record<PresetTema, Omit<TemaResuelto, 'preset'> & { nombre: string }>} */
export const PRESETS = {
  calido: {
    nombre: 'Cálido',
    colorPrimario: '#B08F55',
    colorFondo: '#F8F1E1',
    colorTexto: '#3B2F22',
    fuenteTitulos: 'Fraunces',
    fuenteTexto: 'Inter',
    ornamento: 'festón',
    variables: { '--radius': '14px', '--radius-lg': '20px' },
  },
  minimal: {
    nombre: 'Minimal',
    colorPrimario: '#1F1F1F',
    colorFondo: '#FFFFFF',
    colorTexto: '#1A1A1A',
    fuenteTitulos: 'DM Serif Display',
    fuenteTexto: 'Inter',
    ornamento: 'línea',
    variables: { '--radius': '6px', '--radius-lg': '10px', '--color-tarjeta': '#FAFAFA' },
  },
  oscuro: {
    nombre: 'Oscuro',
    colorPrimario: '#D9A86C',
    colorFondo: '#15161A',
    colorTexto: '#F2EEE8',
    fuenteTitulos: 'Playfair Display',
    fuenteTexto: 'Inter',
    ornamento: 'ninguno',
    variables: {
      '--radius': '12px',
      '--radius-lg': '18px',
      '--color-tarjeta': '#212228',
      '--color-sobre-primario': '#15161A',
      '--sombra-rgb': '0, 0, 0',
    },
  },
  vibrante: {
    nombre: 'Vibrante',
    colorPrimario: '#E4572E',
    colorFondo: '#FFF7EE',
    colorTexto: '#2B2118',
    fuenteTitulos: 'Poppins',
    fuenteTexto: 'Poppins',
    ornamento: 'onda',
    variables: { '--radius': '18px', '--radius-lg': '24px' },
  },
}

/**
 * Tema final: el preset elegido, con los valores puntuales que se hayan
 * definido encima (los null/undefined no pisan).
 * @param {import('./tipos').TemaArchivo} tema
 * @returns {TemaResuelto}
 */
export function resolverTema(tema) {
  const preset = PRESETS[tema.preset] ? tema.preset : 'calido'
  const base = PRESETS[preset]
  /**
   * @template T
   * @param {T | null | undefined} v
   * @param {T} def
   * @returns {T}
   */
  const o = (v, def) => (v === null || v === undefined || v === '' ? def : v)
  return {
    preset,
    colorPrimario: o(tema.colorPrimario, base.colorPrimario),
    colorFondo: o(tema.colorFondo, base.colorFondo),
    colorTexto: o(tema.colorTexto, base.colorTexto),
    fuenteTitulos: o(tema.fuenteTitulos, base.fuenteTitulos),
    fuenteTexto: o(tema.fuenteTexto, base.fuenteTexto),
    ornamento: o(tema.ornamento, base.ornamento),
    variables: base.variables,
  }
}

/**
 * URL de Google Fonts para las dos familias del tema.
 * @param {Pick<TemaResuelto, 'fuenteTitulos' | 'fuenteTexto'>} tema
 */
export function googleFontsHref(tema) {
  const familias = [...new Set([tema.fuenteTitulos, tema.fuenteTexto])]
  const params = familias
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}
