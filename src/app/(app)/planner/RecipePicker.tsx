'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Recipe, RecipeType } from '@/types/database'

const RECIPE_TYPES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']

interface RecipePickerProps {
  planId: string
  onAdd: (mpr: Record<string, unknown>) => void
  onClose: () => void
}

export default function RecipePicker({ planId, onAdd, onClose }: RecipePickerProps) {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredientCounts, setIngredientCounts] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<RecipeType | ''>('')
  const [adding, setAdding] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .single()
      if (!member) return

      const { data: recs } = await supabase
        .from('recipes')
        .select('*')
        .eq('household_id', member.household_id)
        .order('name')

      if (!recs) return
      setRecipes(recs)

      const ids = recs.map((r) => r.id)
      if (ids.length > 0) {
        const { data: ings } = await supabase
          .from('ingredients')
          .select('recipe_id')
          .in('recipe_id', ids)
        const counts: Record<string, number> = {}
        for (const row of ings ?? []) {
          counts[row.recipe_id] = (counts[row.recipe_id] ?? 0) + 1
        }
        setIngredientCounts(counts)
      }
      setLoading(false)
    }
    load()
  }, [])

  const filtered = recipes
    .filter((r) => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => filterType === '' || r.type === filterType)

  async function handleAdd(recipe: Recipe) {
    setAdding(recipe.id)
    try {
      const res = await fetch(`/api/meal-plans/${planId}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipe.id, servings: recipe.default_servings || 4 }),
      })
      const data = await res.json()
      if (res.ok) onAdd(data)
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-end">
      <div className="flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-t-2xl bg-white sm:mt-auto overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Ajouter une recette</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-4 pt-3 pb-2 flex-shrink-0 space-y-2">
          <input
            type="search"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setFilterType('')}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterType === '' ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600'
              }`}
            >
              Tous
            </button>
            {RECIPE_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t === filterType ? '' : t)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filterType === t ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">Aucune recette trouvée.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((recipe) => {
                const count = ingredientCounts[recipe.id] ?? 0
                return (
                  <button
                    key={recipe.id}
                    onClick={() => handleAdd(recipe)}
                    disabled={adding === recipe.id}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 text-sm truncate">{recipe.name}</p>
                      {recipe.author && <p className="text-xs text-gray-400 truncate">{recipe.author}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        count > 0
                          ? 'bg-green-50 text-green-600 border border-green-200'
                          : 'bg-amber-50 text-amber-600 border border-amber-200'
                      }`}>
                        {count > 0 ? `✅ ${count}` : '⚠️'}
                      </span>
                      {adding === recipe.id ? (
                        <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span className="text-green-600 font-bold text-lg">+</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
