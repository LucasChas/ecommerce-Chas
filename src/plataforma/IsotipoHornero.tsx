// Isotipo de Hornero: el nido de barro del hornero (un horno redondo con su
// entrada de costado). Usa currentColor, así toma el color de donde se ponga.
export default function IsotipoHornero({ tamano = 30 }: { tamano?: number }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Rama donde se apoya el nido */}
      <path d="M4 40h40" />
      {/* Cúpula de barro */}
      <path d="M9 40c0-12 6.5-22 15-22s15 10 15 22" />
      {/* Capas de barro */}
      <path d="M14 30c3-1.5 6.5-2 10-2" opacity={0.55} />
      <path d="M12.5 35c4-1.2 8-1.6 11.5-1.6" opacity={0.55} />
      {/* Entrada */}
      <path d="M27 40v-5a4 4 0 0 1 8 0v5" fill="currentColor" stroke="none" />
    </svg>
  )
}
