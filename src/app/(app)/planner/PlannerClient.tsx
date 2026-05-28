'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MealPlanWithRecipes, MealPlanRecipeWithDetails } from '@/types/database'
import { getMondayOf, addWeeks, toDateString, fromDateString, formatWeekRange, dayLabel } from '@/lib/weeks'
import RecipePicker from './RecipePicker'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default function PlannerClient() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf())
  const [plan, setPlan] = useState<MealPlanWithRecipes | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPicker, setShowPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // debounce map: mprId → timeout
  const servingsTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const fetchPlan = useCallback(async (monday: Date) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meal-plans/current?week=${toDateString(monday)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPlan(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlan(weekStart)
  }, [weekStart, fetchPlan])

  function prevWeek() { setWeekStart((w) => addWeeks(w, -1)) }
  function nextWeek() { setWeekStart((w) => addWeeks(w, 1)) }

  function handleRecipeAdded(mpr: Record<string, unknown>) {
    setShowPicker(false)
    setPlan((prev) => prev ? { ...prev, meal_plan_recipes: [...prev.meal_plan_recipes, mpr as unknown as MealPlanRecipeWithDetails] } : prev)
  }

  async function removeRecipe(mprId: string) {
    if (!plan) return
    // optimistic
    setPlan((prev) => prev ? { ...prev, meal_plan_recipes: prev.meal_plan_recipes.filter((m) => m.id !== mprId) } : prev)
    await fetch(`/api/meal-plans/${plan.id}/recipes/${mprId}`, { method: 'DELETE' })
  }

  function updateServingsLocal(mprId: string, delta: number) {
    setPlan((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        meal_plan_recipes: prev.meal_plan_recipes.map((m) =>
          m.id === mprId ? { ...m, servings: Math.max(1, m.servings + delta) } : m
        ),
      }
    })
  }

  function scheduleServingsPatch(mprId: string, servings: number) {
    const existing = servingsTimers.current.get(mprId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      if (!plan) return
      await fetch(`/api/meal-plans/${plan.id}/recipes/${mprId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servings }),
      })
      servingsTimers.current.delete(mprId)
    }, 600)
    servingsTimers.current.set(mprId, timer)
  }

  function changeServings(mprId: string, delta: number) {
    updateServingsLocal(mprId, delta)
    const mpr = plan?.meal_plan_recipes.find((m) => m.id === mprId)
    if (mpr) scheduleServingsPatch(mprId, Math.max(1, mpr.servings + delta))
  }

  async function assignDay(mprId: string, day: number | null) {
    if (!plan) return
    setPlan((prev) => prev ? {
      ...prev,
      meal_plan_recipes: prev.meal_plan_recipes.map((m) =>
        m.id === mprId ? { ...m, day_of_week: day } : m
      ),
    } : prev)
    await fetch(`/api/meal-plans/${plan.id}/recipes/${mprId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: day }),
    })
  }

  const recipes = plan?.meal_plan_recipes ?? []
  const hasRecipes = recipes.length > 0
  const weekParam = toDateString(weekStart)
  const isCurrentWeek = toDateString(getMondayOf()) === weekParam

  return (
    <div className="space-y-4">
      {/* Week header */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={prevWeek} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600">
          ‹
        </button>
        <div className="text-center">
          <p className="font-semibold text-gray-800 text-sm">{formatWeekRange(weekStart)}</p>
          {isCurrentWeek && <p className="text-xs text-green-600 font-medium">Cette semaine</p>}
        </div>
        <button onClick={nextWeek} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600">
          ›
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">📅</div>
          <p className="font-medium text-gray-600">Aucune recette cette semaine</p>
          <p className="text-sm mt-1">Ajoutez-en avec le bouton + ci-dessous</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recipes.map((mpr) => (
            <MealPlanCard
              key={mpr.id}
              mpr={mpr}
              onRemove={() => removeRecipe(mpr.id)}
              onServingsChange={(delta) => changeServings(mpr.id, delta)}
              onDayChange={(day) => assignDay(mpr.id, day)}
            />
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div className="fixed bottom-16 inset-x-0 z-10 pointer-events-none">
        <div className="max-w-2xl mx-auto px-4 flex justify-between items-center pointer-events-auto">
          {/* FAB */}
          <button
            onClick={() => setShowPicker(true)}
            className="w-14 h-14 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 transition-colors text-2xl font-light flex items-center justify-center"
            aria-label="Ajouter une recette"
          >
            +
          </button>

          {hasRecipes && plan && (
            <Link
              href={`/planner/shopping-list?week=${weekParam}`}
              className="bg-white border border-gray-200 text-gray-800 font-medium text-sm px-4 py-3 rounded-xl shadow-md hover:bg-gray-50 transition-colors"
            >
              🛒 Voir la liste de courses
            </Link>
          )}
        </div>
      </div>

      {showPicker && plan && (
        <RecipePicker
          planId={plan.id}
          onAdd={handleRecipeAdded}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}

interface MealPlanCardProps {
  mpr: MealPlanRecipeWithDetails
  onRemove: () => void
  onServingsChange: (delta: number) => void
  onDayChange: (day: number | null) => void
}

function MealPlanCard({ mpr, onRemove, onServingsChange, onDayChange }: MealPlanCardProps) {
  const recipe = mpr.recipe
  const ingCount = recipe.ingredients?.length ?? 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {mpr.day_of_week !== null && (
              <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">
                {dayLabel(mpr.day_of_week)}
              </span>
            )}
            <h3 className="font-semibold text-gray-900 truncate">{recipe.name}</h3>
          </div>
          {recipe.author && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{recipe.author}</p>
          )}
          {ingCount === 0 && (
            <p className="text-xs text-amber-600 mt-0.5">⚠️ Pas d&apos;ingrédients</p>
          )}
        </div>
        <button
          onClick={onRemove}
          className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-xl leading-none p-1"
          aria-label="Retirer"
        >
          ×
        </button>
      </div>

      {/* Servings control */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">Portions :</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onServingsChange(-1)}
            disabled={mpr.servings <= 1}
            className="w-9 h-9 rounded-lg border border-gray-200 text-gray-700 text-lg font-medium flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            −
          </button>
          <span className="w-8 text-center font-semibold text-gray-900">{mpr.servings}</span>
          <button
            onClick={() => onServingsChange(1)}
            className="w-9 h-9 rounded-lg border border-gray-200 text-gray-700 text-lg font-medium flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Day selector */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
        {DAYS.map((label, i) => {
          const active = mpr.day_of_week === i
          return (
            <button
              key={i}
              onClick={() => onDayChange(active ? null : i)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-gray-200 text-gray-500 hover:border-green-300'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
