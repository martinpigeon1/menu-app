'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Recipe } from '@/types/database'
import { amsterdamToday, getMondayOf, addWeeks, toDateString, fromDateString } from '@/lib/weeks'
import { saveSelection } from '@/lib/shoppingSelection'
import RecipePicker from './RecipePicker'
import DayPickerModal from '@/components/ui/DayPickerModal'

const FR_WD_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
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
function shortDate(dateStr: string): string {
  const d = fromDateString(dateStr)
  return `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}
function dayHeader(dateStr: string): string {
  const d = fromDateString(dateStr)
  return `${FR_WD_SHORT[dowOf(d)]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
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
  const [extraWeeks, setExtraWeeks] = useState(0)

  const [showPicker, setShowPicker] = useState(false)
  const [pickerDate, setPickerDate] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showDayPicker, setShowDayPicker] = useState(false)

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

  // ── Date scaffolding (Amsterdam-anchored) ──
  const today = amsterdamToday()
  const todayStr = toDateString(today)
  const yesterdayStr = addDaysStr(todayStr, -1)
  const thisMonday = toDateString(getMondayOf())
  const nextMonday = toDateString(addWeeks(getMondayOf(), 1))
  const lastWindowDate = addDaysStr(todayStr, 13 + extraWeeks * 7)

  // Window: yesterday → today+13 (+ extension). Plus any planned dates beyond it.
  const windowDays: string[] = []
  for (let i = -1; i <= 13 + extraWeeks * 7; i++) windowDays.push(addDaysStr(todayStr, i))
  const allDates = new Set<string>(windowDays)
  for (const m of meals) allDates.add(m.date)
  const sortedDates = [...allDates].sort()

  const mealsByDate = new Map<string, PlannerMeal[]>()
  for (const m of meals) {
    const arr = mealsByDate.get(m.date) ?? []
    arr.push(m)
    mealsByDate.set(m.date, arr)
  }

  // Group into weeks (by Monday).
  const weeks: { monday: string; days: string[] }[] = []
  for (const date of sortedDates) {
    const monday = toDateString(getMondayOf(fromDateString(date)))
    const last = weeks[weeks.length - 1]
    if (last && last.monday === monday) last.days.push(date)
    else weeks.push({ monday, days: [date] })
  }

  const hasBeyond = meals.some((m) => m.date > lastWindowDate)

  function weekRange(mondayStr: string): string {
    const mon = fromDateString(mondayStr)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    if (mon.getMonth() === sun.getMonth()) return `${mon.getDate()}–${sun.getDate()} ${FR_MONTHS[mon.getMonth()]}`
    return `${mon.getDate()} ${FR_MONTHS[mon.getMonth()]} – ${sun.getDate()} ${FR_MONTHS[sun.getMonth()]}`
  }
  function weekLabel(mondayStr: string): string {
    if (mondayStr === thisMonday) return `Cette semaine · ${weekRange(mondayStr)}`
    if (mondayStr === nextMonday) return `Semaine prochaine · ${weekRange(mondayStr)}`
    return `Semaine du ${shortDate(mondayStr)}`
  }

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

  async function assignDay(meal: PlannerMeal, newDow: number) {
    const newDate = addDaysStr(meal.week_start, newDow)
    setMeals((prev) => prev.map((m) => (m.id === meal.id ? { ...m, day_of_week: newDow, date: newDate } : m)))
    await fetch(`/api/meal-plans/${meal.meal_plan_id}/recipes/${meal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day_of_week: newDow }),
    }).catch(() => {})
  }

  function openPickerForDay(dateStr: string) {
    setPickerDate(dateStr)
    setShowPicker(true)
  }

  return (
    <div className="space-y-4 pb-4">
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
        <div className="space-y-5">
          {weeks.map((wk) => (
            <div key={wk.monday} className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{weekLabel(wk.monday)}</p>

              {wk.days.map((date) => {
                const dayMeals = mealsByDate.get(date) ?? []
                const isToday = date === todayStr
                const isYesterday = date === yesterdayStr
                return (
                  <div key={date} className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${isYesterday ? 'opacity-60' : ''}`}>
                    {/* Day header */}
                    <div className={`flex items-center justify-between px-4 py-2.5 ${isToday ? 'bg-green-50' : ''}`}>
                      <span className="text-sm font-semibold text-gray-900">{dayHeader(date)}</span>
                      <button
                        onClick={() => openPickerForDay(date)}
                        aria-label="Ajouter une recette"
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-green-600 hover:bg-green-50 text-lg font-light transition-colors"
                      >
                        +
                      </button>
                    </div>

                    {/* Meals */}
                    {dayMeals.length > 0 && (
                      <ul className="border-t border-gray-50">
                        {dayMeals.map((meal) => {
                          const expanded = expandedId === meal.id
                          return (
                            <li key={meal.id} className="border-b border-gray-50 last:border-b-0">
                              <div className="flex items-center gap-2 px-4 py-2.5">
                                <span className="text-gray-300 shrink-0">·</span>
                                <Link
                                  href={`/recettes/${meal.recipe_id}`}
                                  className="text-sm font-medium text-gray-800 hover:text-green-700 transition-colors truncate"
                                >
                                  {meal.name}
                                </Link>
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
                                  {/* Day chips */}
                                  <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
                                    {FR_WD_SHORT.map((label, i) => {
                                      const active = meal.day_of_week === i
                                      return (
                                        <button
                                          key={i}
                                          onClick={() => assignDay(meal, i)}
                                          className={`shrink-0 px-2.5 py-1 rounded-2xl text-xs font-medium border transition-colors ${
                                            active ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-500 hover:border-green-300'
                                          }`}
                                        >
                                          {label}
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
                )
              })}
            </div>
          ))}

          {/* Plan further out */}
          {!hasBeyond && (
            <button
              onClick={() => setExtraWeeks((e) => e + 2)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 text-sm font-medium hover:border-green-300 hover:text-green-600 transition-colors"
            >
              + Planifier plus loin
            </button>
          )}
        </div>
      )}

      {/* Recipe picker for a specific day */}
      {showPicker && pickerDate && (
        <RecipePicker
          title={`Ajouter au ${dayHeader(pickerDate)}`}
          onSelect={async (recipe) => { await addRecipeToDay(recipe, pickerDate); setShowPicker(false) }}
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
    </div>
  )
}
