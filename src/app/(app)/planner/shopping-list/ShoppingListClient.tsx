'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ShoppingCategory } from '@/types/database'
import { getMondayOf, toDateString, fromDateString, formatWeekRange } from '@/lib/weeks'

export default function ShoppingListClient() {
  const searchParams = useSearchParams()

  const weekParam = searchParams.get('week')
  const weekStart = weekParam ? fromDateString(weekParam) : getMondayOf()
  const weekKey = toDateString(weekStart)

  const [planId, setPlanId] = useState<string | null>(null)
  const [categories, setCategories] = useState<ShoppingCategory[]>([])
  const [missingRecipes, setMissingRecipes] = useState<string[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loadingPlan, setLoadingPlan] = useState(true)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load checked state from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`shopping-checked-${weekKey}`)
      if (raw) setChecked(new Set(JSON.parse(raw)))
    } catch {}
  }, [weekKey])

  // Persist checked state to localStorage
  function persistChecked(next: Set<string>) {
    try {
      localStorage.setItem(`shopping-checked-${weekKey}`, JSON.stringify([...next]))
    } catch {}
    setChecked(next)
  }

  function toggleItem(key: string) {
    const next = new Set(checked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    persistChecked(next)
  }

  function uncheckAll() {
    persistChecked(new Set())
  }

  const fetchShoppingList = useCallback(async (id: string) => {
    setLoadingList(true)
    setError(null)
    try {
      const res = await fetch(`/api/meal-plans/${id}/shopping-list`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCategories(data.categories ?? [])
      setMissingRecipes(data.missing_recipes ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la génération de la liste')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    async function fetchPlan() {
      setLoadingPlan(true)
      try {
        const res = await fetch(`/api/meal-plans/current?week=${weekKey}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setPlanId(data.id)
        // Auto-generate the shopping list
        await fetchShoppingList(data.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setLoadingPlan(false)
      }
    }
    fetchPlan()
  }, [weekKey, fetchShoppingList])

  function itemKey(name: string, unit: string | null) {
    return `${name.toLowerCase().trim()}__${(unit ?? '').toLowerCase()}`
  }

  function formatQty(q: number | null) {
    if (q === null) return ''
    const rounded = Math.round(q * 100) / 100
    return rounded % 1 === 0 ? rounded.toString() : rounded.toString()
  }

  const totalItems = categories.reduce((s, c) => s + c.ingredients.length, 0)
  const checkedCount = checked.size

  const isLoading = loadingPlan || loadingList

  return (
    <div className="space-y-5 print:space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <Link href="/planner" className="text-gray-400 hover:text-gray-600 text-sm">← Retour</Link>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900">Liste de courses</h2>
          <p className="text-xs text-gray-500">{formatWeekRange(weekStart)}</p>
        </div>
        {!isLoading && totalItems > 0 && (
          <button
            onClick={uncheckAll}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg print:hidden"
          >
            Tout décocher
          </button>
        )}
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">Liste de courses — {formatWeekRange(weekStart)}</h1>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">
            {loadingPlan ? 'Chargement du plan…' : 'Claude prépare la liste…'}
          </p>
        </div>
      ) : error ? (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
      ) : (
        <>
          {/* Missing ingredients warning */}
          {missingRecipes.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <p className="font-medium mb-1">⚠️ Ces recettes n&apos;ont pas d&apos;ingrédients :</p>
              <ul className="list-disc list-inside space-y-0.5">
                {missingRecipes.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          {totalItems === 0 && missingRecipes.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="font-medium">Aucun ingrédient dans le plan</p>
              <p className="text-sm mt-1">Ajoutez des recettes avec des ingrédients au planner.</p>
            </div>
          ) : (
            <>
              {/* Progress */}
              {totalItems > 0 && (
                <p className="text-xs text-gray-500 print:hidden">
                  {checkedCount}/{totalItems} article{totalItems > 1 ? 's' : ''} cochés
                </p>
              )}

              {/* Regenerate */}
              {planId && (
                <button
                  onClick={() => fetchShoppingList(planId)}
                  className="text-xs text-green-600 hover:text-green-700 print:hidden"
                >
                  ↻ Regénérer
                </button>
              )}

              {/* Categories */}
              <div className="space-y-4">
                {categories.map((cat) => (
                  <div key={cat.category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat.category}</h3>
                    </div>
                    <ul>
                      {cat.ingredients.map((ing, idx) => {
                        const key = itemKey(ing.name, ing.unit)
                        const isChecked = checked.has(key)
                        return (
                          <li
                            key={idx}
                            onClick={() => toggleItem(key)}
                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                              idx < cat.ingredients.length - 1 ? 'border-b border-gray-50' : ''
                            } ${isChecked ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isChecked ? 'bg-green-600 border-green-600' : 'border-gray-300'
                            }`}>
                              {isChecked && <span className="text-white text-xs font-bold">✓</span>}
                            </div>
                            <span className={`flex-1 text-sm transition-colors ${isChecked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {formatQty(ing.quantity) && (
                                <span className="text-gray-500 mr-1">{formatQty(ing.quantity)}{ing.unit ? ` ${ing.unit}` : ''}</span>
                              )}
                              {ing.name}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
