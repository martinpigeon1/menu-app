'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { Recipe } from '@/types/database'

/**
 * Inline recipe card rendered inside an assistant message in place of a
 * [[RECIPE:{id}:{name}]] marker: name + type badge + ★ rating, with a
 * "📅 Ajouter" button that opens the planner sheet pre-selected on this recipe.
 */
export default function ChefRecipeChip({
  recipe,
  fallbackName,
  onAdd,
}: {
  recipe?: Recipe
  fallbackName: string
  onAdd?: (recipe: Recipe) => void
}) {
  // Unknown recipe (id not in the household list) — render a plain pill.
  if (!recipe) {
    return (
      <span className="inline-block my-1 px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-sm font-medium">
        {fallbackName}
      </span>
    )
  }

  return (
    <div className="my-1.5 border border-gray-200 rounded-lg px-3 py-2 bg-white">
      <div className="flex items-center justify-between gap-2">
        <Link href={`/recettes/${recipe.id}`} className="min-w-0 group">
          <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-green-700 transition-colors">
            {recipe.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge type={recipe.type} compact />
            {recipe.rating != null && recipe.rating > 0 && (
              <span className="text-xs whitespace-nowrap">
                <span className="text-amber-400">★</span>
                <span className="text-gray-600 ml-0.5">{recipe.rating}</span>
              </span>
            )}
          </div>
        </Link>
        {onAdd && (
          <button
            onClick={() => onAdd(recipe)}
            className="flex-shrink-0 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
          >
            📅 Ajouter
          </button>
        )}
      </div>
    </div>
  )
}
