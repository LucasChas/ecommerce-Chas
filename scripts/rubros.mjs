// ============================================================================
// Rubros prearmados para `pnpm nueva-tienda`: cómo se llaman las variantes,
// qué datos extra tiene cada producto, el placeholder de la descripción y el
// seed de categorías iniciales (supabase/seeds/<rubro>.sql).
// Para sumar un rubro: agregalo acá y creá su seed.
// ============================================================================

export const RUBROS = {
  generico: {
    nombre: 'Genérico',
    etiquetaVariante: 'Opción',
    atributos: [],
    placeholderDescripcion: 'Material, medidas, detalles...',
  },
  ropa: {
    nombre: 'Ropa y accesorios',
    etiquetaVariante: 'Talle',
    atributos: [
      { clave: 'material', etiqueta: 'Material' },
      { clave: 'cuidados', etiqueta: 'Cuidados' },
    ],
    placeholderDescripcion: 'Corte, calce, detalles...',
  },
  deco: {
    nombre: 'Deco y hogar',
    etiquetaVariante: 'Color',
    atributos: [
      { clave: 'medidas', etiqueta: 'Medidas' },
      { clave: 'material', etiqueta: 'Material' },
    ],
    placeholderDescripcion: 'Estilo, terminación, usos...',
  },
  alimentos: {
    nombre: 'Alimentos',
    etiquetaVariante: 'Presentación',
    atributos: [
      { clave: 'ingredientes', etiqueta: 'Ingredientes' },
      { clave: 'conservacion', etiqueta: 'Conservación' },
      { clave: 'alergenos', etiqueta: 'Alérgenos' },
    ],
    placeholderDescripcion: 'Sabor, elaboración, sugerencias...',
  },
}
