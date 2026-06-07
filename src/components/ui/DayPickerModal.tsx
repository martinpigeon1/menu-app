'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { amsterdamToday, toDateString, fromDateString } from '@/lib/weeks'
import { ShoppingSelection } from '@/lib/shoppingSelection'

const FR_WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

interface Meal { id: string; name: string; date: string }
interface DayGroup { date: string; meals: Meal[] }

interface DayPickerModalProps {
  /** Pre-select the days containing these meal ids (used when re-editing). */
  initialRecipeIds?: string[]
  onClose: () => void
  onConfirm: (selection: ShoppingSelection) => void
}

function dayLabel(date: string, todayStr: string, tomorrowStr: string): string {
  if (date === todayStr) return "Aujourd'hui"
  if (date === tomorrowStr) return 'Demain'
  const d = fromDateString(date)
  return `${FR_WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}

function shortDate(date: string): string {
  const d = fromDateString(date)
  return `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}

export default function DayPickerModal({ initialRecipeIds, onClose, onConfirm }: DayPickerModalProps) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())

  const todayStr = toDateString(amsterdamToday())
  const tomorrow = amsterdamToday(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = toDateString(tomorrow)
  const plus3 = amsterdamToday(); plus3.setDate(plus3.getDate() + 3)
  const plus3Str = toDateString(plus3)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/meal-plans/upcoming')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Erreur')
        if (cancelled) return
        const m: Meal[] = data.meals ?? []
        setMeals(m)

        // Default selection: days containing the given ids, else the next 4 days.
        if (initialRecipeIds && initialRecipeIds.length > 0) {
          const idSet = new Set(initialRecipeIds)
          setSelectedDates(new Set(m.filter((x) => idSet.has(x.id)).map((x) => x.date)))
        } else {
          setSelectedDates(new Set(m.filter((x) => x.date >= todayStr && x.date <= plus3Str).map((x) => x.date)))
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups: DayGroup[] = useMemo(() => {
    const byDate = new Map<string, Meal[]>()
    for (const m of meals) {
      const arr = byDate.get(m.date) ?? []
      arr.push(m)
      byDate.set(m.date, arr)
    }
    return [...byDate.entries()].map(([date, ms]) => ({ date, meals: ms }))
  }, [meals])

  function toggleDay(date: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const selectedMeals = meals.filter((m) => selectedDates.has(m.date))
  const selectedCount = selectedMeals.length

  function confirm() {
    if (selectedCount === 0) return
    const dates = [...selectedDates].sort()
    onConfirm({
      recipeIds: selectedMeals.map((m) => m.id),
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50">
      <div className="flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-2xl sm:bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Choisir les jours</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Chargement des repas…</p>
            </div>
          ) : error ? (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">📅</div>
              <p className="font-medium text-gray-600">Aucun repas planifié</p>
              <p className="text-sm mt-1">Assignez des recettes à des jours dans le planner.</p>
              <Link href="/planner" onClick={onClose} className="inline-block mt-3 text-sm text-green-600 hover:text-green-700 font-medium">
                Aller au planner →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-4 pb-1">
                <button
                  onClick={() => setSelectedDates(new Set(groups.map((g) => g.date)))}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  Tout sélectionner
                </button>
                <button
                  onClick={() => setSelectedDates(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  Tout désélectionner
                </button>
              </div>

              {groups.map((g) => {
                const isSel = selectedDates.has(g.date)
                return (
                  <div
                    key={g.date}
                    className={`rounded-xl border transition-colors ${isSel ? 'border-green-300 bg-green-50/40' : 'border-gray-200'}`}
                  >
                    <button
                      onClick={() => toggleDay(g.date)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSel ? 'bg-green-600 border-green-600' : 'border-gray-300'
                      }`}>
                        {isSel && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{dayLabel(g.date, todayStr, tomorrowStr)}</span>
                    </button>
                    <ul className="pb-2 pl-11 pr-3 space-y-0.5">
                      {g.meals.map((m) => (
                        <li key={m.id} className="text-xs text-gray-500">· {m.name}</li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && groups.length > 0 && (
          <div className="p-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={confirm}
              disabled={selectedCount === 0}
              className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Générer la liste ({selectedCount} recette{selectedCount !== 1 ? 's' : ''})
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export { shortDate }
