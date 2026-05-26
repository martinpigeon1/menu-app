// Composant badge pour afficher le type de recette avec une couleur distinctive
import { RecipeType } from '@/types/database'

const typeColors: Record<RecipeType, string> = {
  Plat: 'bg-green-100 text-green-800',
  Salade: 'bg-lime-100 text-lime-800',
  Soupe: 'bg-yellow-100 text-yellow-800',
  Entrée: 'bg-orange-100 text-orange-800',
  Accompagnement: 'bg-blue-100 text-blue-800',
  Dessert: 'bg-pink-100 text-pink-800',
}

interface BadgeProps {
  type: RecipeType
  className?: string
}

export default function Badge({ type, className = '' }: BadgeProps) {
  const colorClass = typeColors[type] ?? 'bg-gray-100 text-gray-800'

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass} ${className}`}
    >
      {type}
    </span>
  )
}
