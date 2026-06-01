import { RecipeType } from '@/types/database'

const typeColors: Record<RecipeType, string> = {
  Plat: 'bg-green-100 text-green-800',
  Salade: 'bg-lime-100 text-lime-800',
  Soupe: 'bg-yellow-100 text-yellow-800',
  Entrée: 'bg-orange-100 text-orange-800',
  Accompagnement: 'bg-blue-100 text-blue-800',
  Dessert: 'bg-pink-100 text-pink-800',
}

const typeLabels: Partial<Record<RecipeType, string>> = {
  Accompagnement: 'Accomt.',
}

interface BadgeProps {
  type: RecipeType
  compact?: boolean
  className?: string
}

export default function Badge({ type, compact = false, className = '' }: BadgeProps) {
  const colorClass = typeColors[type] ?? 'bg-gray-100 text-gray-800'
  const label = compact ? (typeLabels[type] ?? type) : type
  const sizeClass = compact
    ? 'text-[11px] px-1.5 py-0.5'
    : 'text-xs px-2.5 py-0.5'

  return (
    <span className={`inline-flex items-center rounded-full font-medium max-w-full truncate ${sizeClass} ${colorClass} ${className}`}>
      {label}
    </span>
  )
}
