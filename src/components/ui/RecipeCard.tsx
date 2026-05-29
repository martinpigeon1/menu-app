import Link from 'next/link'
import { Recipe } from '@/types/database'
import Badge from './Badge'
import StarRating from './StarRating'

interface RecipeCardProps {
  recipe: Recipe
  ingredientCount?: number
  onAddToPlanner?: () => void
}

const sourceLabels: Record<string, string> = {
  livre: 'Livre',
  site: 'Site web',
  autre: 'Autre',
}

export default function RecipeCard({ recipe, ingredientCount = 0, onAddToPlanner }: RecipeCardProps) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-green-200 transition-all">
      <Link
        href={`/recettes/${recipe.id}`}
        className="block p-4 pr-14"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900 truncate">{recipe.name}</h3>
              {ingredientCount > 0 && (
                <span className="shrink-0 text-xs bg-green-50 text-green-600 border border-green-200 rounded-full px-1.5 py-0.5 leading-none">
                  {ingredientCount} ing.
                </span>
              )}
            </div>
            {recipe.author && (
              <p className="text-xs text-gray-400 truncate mt-0.5">{recipe.author}</p>
            )}

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

      {onAddToPlanner && (
        <button
          onClick={onAddToPlanner}
          title="Ajouter au planning"
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors text-base"
        >
          📅
        </button>
      )}
    </div>
  )
}
