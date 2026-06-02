'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Recipe, Ingredient, RecipeStep } from '@/types/database'
import StepText from '@/components/ui/StepText'
import { scaleValue, formatScaled } from '@/lib/scale'
import { useWakeLock } from '@/lib/useWakeLock'

export default function CookingModePage() {
  const params = useParams()
  const id = params.id as string

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [steps, setSteps] = useState<RecipeStep[]>([])
  const [loading, setLoading] = useState(true)
  const [servings, setServings] = useState(4)
  const [showIngredients, setShowIngredients] = useState(false)

  // Keep the screen awake while cooking.
  useWakeLock(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data }, { data: ings }, { data: stepRows }] = await Promise.all([
        supabase.from('recipes').select('*').eq('id', id).single(),
        supabase.from('ingredients').select('*').eq('recipe_id', id).order('sort_order'),
        supabase.from('recipe_steps').select('*').eq('recipe_id', id).order('step_number'),
      ])
      if (data) {
        setRecipe(data)
        setIngredients(ings ?? [])
        setSteps(stepRows ?? [])
        // Restore the last-used serving size, otherwise default to recipe's.
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(`cuisine-servings-${id}`) : null
        setServings(stored ? parseInt(stored) : data.default_servings)
      }
      setLoading(false)
    }
    load()
  }, [id])

  function changeServings(delta: number) {
    setServings((s) => {
      const next = Math.max(1, s + delta)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`cuisine-servings-${id}`, next.toString())
      }
      return next
    })
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center text-gray-500 text-sm">
        Chargement…
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-600 text-sm">Recette introuvable.</p>
        <Link href={`/recettes/${id}`} className="text-green-600 text-sm hover:underline">← Retour</Link>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Top bar */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href={`/recettes/${id}`}
          className="text-sm text-gray-600 font-medium px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          ✕ Fermer
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Pour</span>
          <button
            onClick={() => changeServings(-1)}
            disabled={servings <= 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 text-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            −
          </button>
          <span className="w-7 text-center font-bold text-gray-900 text-lg">{servings}</span>
          <button
            onClick={() => changeServings(1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-700 text-lg hover:bg-gray-50 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-24">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{recipe.name}</h1>

        {/* Ingredients summary (collapsed by default) */}
        {ingredients.length > 0 && (
          <div className="mb-6 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowIngredients((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-800">
                Ingrédients ({ingredients.length})
              </span>
              <span className="text-gray-400 text-sm">{showIngredients ? '▲' : '▼'}</span>
            </button>
            {showIngredients && (
              <ul className="px-4 pb-3 space-y-1.5 border-t border-gray-100 pt-3">
                {ingredients.map((ing) => {
                  const qty =
                    ing.quantity !== null
                      ? formatScaled(scaleValue(ing.quantity, servings, recipe.default_servings))
                      : ''
                  return (
                    <li key={ing.id} className="text-base text-gray-700 flex gap-2">
                      {(ing.quantity !== null || ing.unit) && (
                        <span className="text-green-700 font-semibold shrink-0">
                          {qty}{ing.unit ? ` ${ing.unit}` : ''}
                        </span>
                      )}
                      <span>{ing.name}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* Steps */}
        {steps.length === 0 ? (
          <p className="text-gray-500 text-base">Aucune étape pour cette recette.</p>
        ) : (
          <ol className="space-y-6">
            {steps.map((step, i) => (
              <li key={step.id} className="flex gap-4">
                <span className="mt-0.5 w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-green-600 text-white text-base font-bold">
                  {i + 1}
                </span>
                <p className="text-lg text-gray-800 leading-relaxed">
                  <StepText
                    text={step.text}
                    selectedServings={servings}
                    defaultServings={recipe.default_servings}
                  />
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
