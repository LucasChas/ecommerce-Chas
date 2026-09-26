import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ProductoConCategoria } from '../../types'
import { supabase } from '../../lib/supabaseClient'
import { useDialog } from '../../context/DialogContext'
import ProductCard from './ProductCard'
import { t } from '../../i18n/textos'

interface Props {
  productos: ProductoConCategoria[]
  onEditar: (producto: ProductoConCategoria) => void
  // Se llama después de una edición inline para refrescar los datos.
  onChanged: () => void
  // Se puede reordenar solo con la lista completa (sin búsqueda ni filtros):
  // con una lista filtrada, el orden resultante sería ambiguo.
  ordenable: boolean
}

// Lista de productos del panel (cards, no tabla). El orden es el del catálogo
// público; se cambia arrastrando desde la manija ⋮⋮ de cada card.
export default function ProductList({ productos, onEditar, onChanged, ordenable }: Props) {
  const { avisar } = useDialog()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  async function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const desde = productos.findIndex((p) => p.id === active.id)
    const hasta = productos.findIndex((p) => p.id === over.id)
    const ids = arrayMove(productos, desde, hasta).map((p) => p.id)
    const { error } = await supabase.rpc('ordenar_productos', { p_ids: ids })
    if (error) await avisar({ titulo: 'No se pudo cambiar el orden', mensaje: error.message })
    onChanged()
  }

  if (productos.length === 0) {
    return (
      <div className="list">
        <div className="empty">
          Todavía no cargaste ningún producto.
          <br />
          {t('admin.productosVacio')}
        </div>
      </div>
    )
  }

  if (!ordenable) {
    return (
      <div className="list">
        {productos.map((p) => (
          <ProductCard key={p.id} producto={p} onEditar={onEditar} onChanged={onChanged} />
        ))}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={productos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="list">
          {productos.map((p) => (
            <FilaOrdenable key={p.id} producto={p} onEditar={onEditar} onChanged={onChanged} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function FilaOrdenable(props: Omit<React.ComponentProps<typeof ProductCard>, 'manija'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.producto.id,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 2 : undefined }}
      className={isDragging ? 'arrastrando' : undefined}
    >
      <ProductCard
        {...props}
        manija={
          <button type="button" className="prod-manija" aria-label="Arrastrar para ordenar" {...attributes} {...listeners}>
            ⋮⋮
          </button>
        }
      />
    </div>
  )
}
