// Carte de recette pour la liste des recettes
import Link from 'next/link'
import { Recipe } from '@/types/database'
import Badge from './Badge'
import StarRating from './StarRating'

interface RecipeCardProps {
  recipe: Recipe
}

const sourceLabels: Record<string, string> = {
  livre: 'Livre',
  site: 'Site web',
  autre: 'Autre',
}

export default function RecipeCard({ recipe }: RecipeCardProps) {
  return (
    <Link
      href={`/recettes/${recipe.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-green-200 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{recipe.name}</h3>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <Badge type={recipe.type} />
            {recipe.source && (
              <span className="text-xs text-gray-500">
                {sourceLabels[recipe.source] ?? recipe.source}
                {recipe.source === 'livre' && recipe.source_book && ` — ${recipe.source_book}`}
              </span>
            )}
            {recipe.prep_time_minutes && (
              <span className="text-xs text-gray-500">
                {recipe.prep_time_minutes} min
              </span>
            )}
          </div>
        </div>

        {recipe.rating !== null && recipe.rating > 0 && (
          <div className="flex-shrink-0">
            <StarRating value={recipe.rating} readOnly size="sm" />
          </div>
        )}
      </div>

      {recipe.notes && (
        <p className="mt-2 text-xs text-gray-500 line-clamp-2">{recipe.notes}</p>
      )}
    </Link>
  )
}
