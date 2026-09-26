// ============================================================================
// Rubros de las tiendas: cómo se llaman las variantes, qué datos extra tiene
// cada producto y el placeholder de la descripción. La tienda guarda su rubro
// al darse de alta (tiendas.rubro) y la vitrina y el panel usan esto.
// Las categorías iniciales de cada rubro están en la base:
// categorias_iniciales() (migración 0018).
// Para sumar un rubro: agregalo acá y en categorias_iniciales().
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
  bebes: {
    nombre: 'Bebés y niños',
    etiquetaVariante: 'Talle',
    atributos: [
      { clave: 'material', etiqueta: 'Material' },
      { clave: 'cuidados', etiqueta: 'Cuidados' },
    ],
    placeholderDescripcion: 'Talle, material, detalles...',
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
