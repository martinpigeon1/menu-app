'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Recipe } from '@/types/database'
import { amsterdamToday, getMondayOf, addWeeks, toDateString, fromDateString, isDayInPast } from '@/lib/weeks'
import { saveSelection } from '@/lib/shoppingSelection'
import RecipePicker from './RecipePicker'
import DayStrip from './DayStrip'
import DayPickerModal from '@/components/ui/DayPickerModal'

const FR_WD_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const FR_WD_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

interface PlannerMeal {
  id: string
  meal_plan_id: string
  recipe_id: string
  name: string
  author: string | null
  servings: number
  day_of_week: number
  week_start: string
  date: string
}

function dowOf(d: Date): number {
  return (d.getDay() + 6) % 7 // 0 = Monday
}
function dayHeaderShort(dateStr: string): string {
  const d = fromDateString(dateStr)
  return `${FR_WD_SHORT[dowOf(d)]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}
function dayHeaderFull(dateStr: string): string {
  const d = fromDateString(dateStr)
  return `${FR_WD_FULL[dowOf(d)]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}
function addDaysStr(dateStr: string, n: number): string {
  const d = fromDateString(dateStr)
  d.setDate(d.getDate() + n)
  return toDateString(d)
}

export default function PlannerClient() {
  const router = useRouter()

  const [meals, setMeals] = useState<PlannerMeal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState<string>(() => toDateString(amsterdamToday()))
  const [showPicker, setShowPicker] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDayPicker, setShowDayPicker] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)

  const servingsTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/meal-plans/upcoming')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Erreur')
        if (!cancelled) setMeals(data.meals ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const todayStr = toDateString(amsterdamToday())
  const thisMonday = toDateString(getMondayOf())
  const nextMonday = toDateString(addWeeks(getMondayOf(), 1))

  const mealDates = new Set(meals.map((m) => m.date))
  const dayMeals = meals
    .filter((m) => m.date === selectedDate)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  // ── Mutations ──
  async function addRecipeToDay(recipe: Recipe, dateStr: string) {
    const monday = toDateString(getMondayOf(fromDateString(dateStr)))
    const dow = dowOf(fromDateString(dateStr))
    try {
      const planRes = await fetch(`/api/meal-plans/current?week=${monday}`)
      const planData = await planRes.json()
      if (!planRes.ok) throw new Error(planData.error ?? 'Plan introuvable')
      const addRes = await fetch(`/api/meal-plans/${planData.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipe.id, servings: recipe.default_servings || 4, day_of_week: dow }),
      })
      const mpr = await addRes.json()
      if (!addRes.ok) throw new Error(mpr.error ?? 'Ajout échoué')
      setMeals((prev) => [...prev, {
        id: mpr.id,
        meal_plan_id: planData.id,
        recipe_id: recipe.id,
        name: recipe.name,
        author: recipe.author,
        servings: mpr.servings ?? (recipe.default_servings || 4),
        day_of_week: dow,
        week_start: monday,
        date: dateStr,
      }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function removeMeal(meal: PlannerMeal) {
    setMeals((prev) => prev.filter((m) => m.id !== meal.id))
    if (expandedId === meal.id) setExpandedId(null)
    await fetch(`/api/meal-plans/${meal.meal_plan_id}/recipes/${meal.id}`, { method: 'DELETE' }).catch(() => {})
  }

  function changeServings(meal: PlannerMeal, delta: number) {
    const next = Math.max(1, meal.servings + delta)
    setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, servings: next } : m)))
    const existing = servingsTimers.current.get(meal.id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      fetch(`/api/meal-plans/${meal.meal_plan_id}/recipes/${meal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servings: next }),
      }).catch(() => {})
      servingsTimers.current.delete(meal.id)
    }, 600)
    servingsTimers.current.set(meal.id, timer)
  }

  // Move a meal to another day (and to next week if a past day was picked on the
  // current week). Optimistic; auto-selects the new day; reverts + toasts on error.
  async function moveMeal(meal: PlannerMeal, newDow: number) {
    if (movingId) return
    const toNextWeek = meal.week_start === thisMonday && isDayInPast(newDow)
    const targetWeekStart = toNextWeek ? nextMonday : meal.week_start
    if (newDow === meal.day_of_week && targetWeekStart === meal.week_start) return

    const newDate = addDaysStr(targetWeekStart, newDow)
    const prevMeals = meals
    const prevSelected = selectedDate
    setMovingId(meal.id)
    setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, day_of_week: newDow, week_start: targetWeekStart, date: newDate } : m)))
    setSelectedDate(newDate)

    try {
      const res = await fetch(`/api/meal-plans/${meal.meal_plan_id}/recipes/${meal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_of_week: newDow, target_week_start: targetWeekStart }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Déplacement échoué')
      if (data.meal_plan_id) {
        setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, meal_plan_id: data.meal_plan_id } : m)))
      }
    } catch (e) {
      setMeals(prevMeals)
      setSelectedDate(prevSelected)
      setErrorToast(e instanceof Error ? e.message : 'Erreur')
      setTimeout(() => setErrorToast(null), 2500)
    } finally {
      setMovingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Title + primary action */}
      <h2 className="text-lg font-semibold text-gray-800">Planning</h2>
      <button
        onClick={() => setShowDayPicker(true)}
        className="w-full flex items-center justify-center gap-2 bg-white border border-green-600 text-green-700 font-medium text-sm py-2.5 rounded-lg hover:bg-green-50 transition-colors"
      >
        🛒 Créer ma liste de courses
      </button>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 h-[calc(100dvh-15rem)] min-h-[380px]">
          {/* Left — day strip */}
          <DayStrip
            selectedDate={selectedDate}
            todayStr={todayStr}
            mealDates={mealDates}
            onSelect={setSelectedDate}
          />

          {/* Right — selected day detail */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-900">{dayHeaderFull(selectedDate)}</p>
                <button
                  onClick={() => setShowPicker(true)}
                  className="shrink-0 text-sm text-green-600 hover:text-green-700 font-medium whitespace-nowrap"
                >
                  + Ajouter
                </button>
              </div>

              {dayMeals.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-gray-400">Aucun repas ce jour-là.</p>
              ) : (
                <ul>
                  {dayMeals.map((meal) => {
                    const expanded = expandedId === meal.id
                    const moving = movingId === meal.id
                    return (
                      <li key={meal.id} className={`border-b border-gray-50 last:border-b-0 transition-opacity ${moving ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-2 px-4 py-2.5">
                          <Link
                            href={`/recettes/${meal.recipe_id}`}
                            className="text-sm font-medium text-gray-800 hover:text-green-700 transition-colors truncate"
                          >
                            {meal.name}
                          </Link>
                          {moving && (
                            <span className="shrink-0 w-3.5 h-3.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                          )}
                          <button
                            onClick={() => setExpandedId(expanded ? null : meal.id)}
                            className="ml-auto text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
                          >
                            {meal.servings} portion{meal.servings > 1 ? 's' : ''}
                          </button>
                          <button
                            onClick={() => removeMeal(meal)}
                            aria-label="Retirer"
                            className="shrink-0 text-gray-300 hover:text-red-400 text-lg leading-none px-1"
                          >
                            ×
                          </button>
                        </div>

                        {expanded && (
                          <div className="px-4 pb-3 pt-1 space-y-3 bg-gray-50/50">
                            {/* Portions */}
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 font-medium">Portions :</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => changeServings(meal, -1)} disabled={meal.servings <= 1}
                                  className="w-8 h-8 rounded-lg border border-gray-200 text-gray-700 flex items-center justify-center hover:bg-white disabled:opacity-40 transition-colors">−</button>
                                <span className="w-7 text-center font-semibold text-gray-900 text-sm">{meal.servings}</span>
                                <button onClick={() => changeServings(meal, 1)}
                                  className="w-8 h-8 rounded-lg border border-gray-200 text-gray-700 flex items-center justify-center hover:bg-white transition-colors">+</button>
                              </div>
                            </div>
                            {/* Day chips — move to another day */}
                            <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                              {FR_WD_SHORT.map((label, i) => {
                                const active = meal.day_of_week === i
                                const past = meal.week_start === thisMonday && !active && isDayInPast(i)
                                return (
                                  <button
                                    key={i}
                                    onClick={() => moveMeal(meal, i)}
                                    disabled={moving}
                                    title={past ? 'Jour passé — déplace à la semaine prochaine' : undefined}
                                    className={`shrink-0 flex flex-col items-center px-2.5 py-1 rounded-2xl text-xs font-medium border transition-colors disabled:opacity-50 ${
                                      active
                                        ? 'bg-green-600 text-white border-green-600'
                                        : past
                                        ? 'border-dashed border-gray-200 text-gray-400 hover:border-green-300'
                                        : 'border-gray-200 text-gray-500 hover:border-green-300'
                                    }`}
                                  >
                                    <span>{label}</span>
                                    {past && <span className="text-[8px] leading-none text-amber-500">→ sem.</span>}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recipe picker for the selected day */}
      {showPicker && (
        <RecipePicker
          title={`Ajouter au ${dayHeaderShort(selectedDate)}`}
          onSelect={async (recipe) => { await addRecipeToDay(recipe, selectedDate); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Shopping list day picker */}
      {showDayPicker && (
        <DayPickerModal
          onClose={() => setShowDayPicker(false)}
          onConfirm={(sel) => {
            saveSelection(sel)
            setShowDayPicker(false)
            router.push('/planner/shopping-list')
          }}
        />
      )}

      {/* Move error toast */}
      {errorToast && (
        <div className="fixed bottom-24 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            ⚠️ {errorToast}
          </div>
        </div>
      )}
    </div>
  )
}
