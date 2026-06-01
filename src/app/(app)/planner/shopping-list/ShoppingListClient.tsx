'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ShoppingCategory, ShoppingItem, MealPlanRecipeWithDetails } from '@/types/database'
import { getMondayOf, toDateString, fromDateString, formatWeekRange } from '@/lib/weeks'
import PicnicReviewModal from '@/components/ui/PicnicReviewModal'

type Period = 'week' | 'weekend'

interface PeriodData {
  categories: ShoppingCategory[]
  missing_recipes: string[]
  loaded: boolean
  loading: boolean
  error: string | null
}

const EMPTY_PERIOD: PeriodData = { categories: [], missing_recipes: [], loaded: false, loading: false, error: null }

const TAB_LABELS: Record<Period, string> = {
  week:    '🗓 Semaine (Lun–Ven)',
  weekend: '🗓 Week-end (Sam–Dim)',
}

const PLACARD_CATEGORY = 'Placard'

function itemKey(name: string, unit: string | null) {
  return `${name.toLowerCase().trim()}__${(unit ?? '').toLowerCase()}`
}

function formatQty(q: number | null) {
  if (q === null) return ''
  const r = Math.round(q * 100) / 100
  return r % 1 === 0 ? r.toString() : r.toString()
}

function loadChecked(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return new Set(JSON.parse(raw))
  } catch {}
  return new Set()
}

function saveChecked(storageKey: string, s: Set<string>) {
  try { localStorage.setItem(storageKey, JSON.stringify([...s])) } catch {}
}

export default function ShoppingListClient() {
  const searchParams = useSearchParams()
  const weekParam = searchParams.get('week')
  const weekStart = weekParam ? fromDateString(weekParam) : getMondayOf()
  const weekKey = toDateString(weekStart)

  const [planId, setPlanId] = useState<string | null>(null)
  const [unassigned, setUnassigned] = useState<string[]>([])
  const [loadingPlan, setLoadingPlan] = useState(true)
  const [planError, setPlanError] = useState<string | null>(null)

  const [activePeriod, setActivePeriod] = useState<Period>('week')
  const [periodData, setPeriodData] = useState<Record<Period, PeriodData>>({
    week: EMPTY_PERIOD,
    weekend: EMPTY_PERIOD,
  })

  // Placard: shared across both tabs
  const [placardItems, setPlacardItems] = useState<ShoppingCategory['ingredients']>([])
  const [placardLoading, setPlacardLoading] = useState(false)
  const [placardOpen, setPlacardOpen] = useState(false)

  const [checked, setChecked] = useState<Record<Period, Set<string>>>({
    week: new Set(),
    weekend: new Set(),
  })
  const [placardChecked, setPlacardChecked] = useState<Set<string>>(new Set())

  // Picnic
  const [picnicConnected, setPicnicConnected] = useState<boolean | null>(null)
  const [showPicnicModal, setShowPicnicModal] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/picnic/status')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setPicnicConnected(!!d.connected) })
      .catch(() => { if (!cancelled) setPicnicConnected(false) })
    return () => { cancelled = true }
  }, [])

  const storageKey = useCallback((p: Period | 'placard') => `shopping-checked-${weekKey}-${p}`, [weekKey])

  useEffect(() => {
    setChecked({
      week: loadChecked(storageKey('week')),
      weekend: loadChecked(storageKey('weekend')),
    })
    setPlacardChecked(loadChecked(storageKey('placard')))
  }, [storageKey])

  const fetchPeriod = useCallback(async (id: string, period: Period) => {
    setPeriodData((prev) => ({ ...prev, [period]: { ...prev[period], loading: true, error: null } }))
    try {
      const res = await fetch(`/api/meal-plans/${id}/shopping-list?period=${period}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      // Strip Placard from period responses — it's shown separately via period=all
      const filteredCategories = (data.categories ?? []).filter(
        (c: ShoppingCategory) => c.category !== PLACARD_CATEGORY
      )
      setPeriodData((prev) => ({
        ...prev,
        [period]: { categories: filteredCategories, missing_recipes: data.missing_recipes ?? [], loaded: true, loading: false, error: null },
      }))
    } catch (e) {
      setPeriodData((prev) => ({
        ...prev,
        [period]: { ...prev[period], loading: false, loaded: true, error: e instanceof Error ? e.message : 'Erreur' },
      }))
    }
  }, [])

  const fetchPlacard = useCallback(async (id: string) => {
    setPlacardLoading(true)
    try {
      const res = await fetch(`/api/meal-plans/${id}/shopping-list?period=all`)
      const data = await res.json()
      if (!res.ok) return
      const cat = (data.categories ?? []).find((c: ShoppingCategory) => c.category === PLACARD_CATEGORY)
      setPlacardItems(cat?.ingredients ?? [])
    } catch {
      // best-effort
    } finally {
      setPlacardLoading(false)
    }
  }, [])

  useEffect(() => {
    async function fetchPlan() {
      setLoadingPlan(true)
      setPlanError(null)
      try {
        const res = await fetch(`/api/meal-plans/current?week=${weekKey}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setPlanId(data.id)
        const mprs: MealPlanRecipeWithDetails[] = data.meal_plan_recipes ?? []
        setUnassigned(mprs.filter((m) => m.day_of_week === null).map((m) => m.recipe.name))
        await Promise.all([fetchPeriod(data.id, 'week'), fetchPlacard(data.id)])
      } catch (e) {
        setPlanError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setLoadingPlan(false)
      }
    }
    fetchPlan()
  }, [weekKey, fetchPeriod, fetchPlacard])

  function switchTab(period: Period) {
    setActivePeriod(period)
    if (planId && !periodData[period].loaded && !periodData[period].loading) {
      fetchPeriod(planId, period)
    }
  }

  function toggleItem(period: Period, key: string) {
    setChecked((prev) => {
      const next = new Set(prev[period])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveChecked(storageKey(period), next)
      return { ...prev, [period]: next }
    })
  }

  function togglePlacardItem(key: string) {
    setPlacardChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveChecked(storageKey('placard'), next)
      return next
    })
  }

  function uncheckAll(period: Period) {
    setChecked((prev) => {
      saveChecked(storageKey(period), new Set())
      return { ...prev, [period]: new Set() }
    })
  }

  const current = periodData[activePeriod]
  const currentChecked = checked[activePeriod]
  const totalItems = current.categories.reduce((s, c) => s + c.ingredients.length, 0)

  // Items sent to Picnic: non-Placard (already filtered out of categories) and
  // not checked off (a checked item means the user already has it). Placard
  // staples are never ordered.
  const sendableItems: ShoppingItem[] = current.categories
    .flatMap((c) => c.ingredients)
    .filter((ing) => !currentChecked.has(itemKey(ing.name, ing.unit)))

  return (
    <div className="space-y-4 print:space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 print:hidden">
        <Link href="/planner" className="text-gray-400 hover:text-gray-600 text-sm">← Retour</Link>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900">Liste de courses</h2>
          <p className="text-xs text-gray-500">{formatWeekRange(weekStart)}</p>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">
          Liste de courses — {formatWeekRange(weekStart)} — {TAB_LABELS[activePeriod]}
        </h1>
      </div>

      {planError ? (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{planError}</div>
      ) : loadingPlan ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Chargement du plan…</p>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden bg-gray-50 print:hidden">
            {(['week', 'weekend'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => switchTab(p)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  activePeriod === p
                    ? 'bg-white text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {TAB_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Unassigned warning */}
          {unassigned.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <p className="font-medium">
                ⚠️ {unassigned.length} recette{unassigned.length > 1 ? 's' : ''} sans jour assigné — non incluse{unassigned.length > 1 ? 's' : ''}
              </p>
              <p className="text-xs mt-1 text-amber-700">{unassigned.join(', ')}</p>
            </div>
          )}

          {/* Period content */}
          {current.loading ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Claude prépare la liste…</p>
            </div>
          ) : current.error ? (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {current.error}
              {planId && (
                <button onClick={() => fetchPeriod(planId, activePeriod)} className="ml-2 underline">Réessayer</button>
              )}
            </div>
          ) : (
            <>
              {/* Recipes with no ingredients */}
              {current.missing_recipes.length > 0 && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  <p className="font-medium mb-1">⚠️ Ces recettes n&apos;ont pas d&apos;ingrédients :</p>
                  <p className="text-xs text-amber-700">{current.missing_recipes.join(', ')}</p>
                </div>
              )}

              {totalItems === 0 && placardItems.length === 0 && !placardLoading ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="font-medium">Aucun ingrédient pour cette période</p>
                  <p className="text-sm mt-1">Assignez des recettes à des jours {activePeriod === 'week' ? 'Lun–Ven' : 'Sam–Dim'} dans le planner.</p>
                </div>
              ) : (
                <>
                  {/* Toolbar */}
                  {totalItems > 0 && (
                    <div className="flex items-center justify-between print:hidden">
                      <p className="text-xs text-gray-500">
                        {currentChecked.size}/{totalItems} article{totalItems > 1 ? 's' : ''} cochés
                      </p>
                      <div className="flex items-center gap-3">
                        {planId && (
                          <button
                            onClick={() => {
                              fetchPeriod(planId, activePeriod)
                              fetchPlacard(planId)
                            }}
                            className="text-xs text-green-600 hover:text-green-700"
                          >
                            ↻ Regénérer
                          </button>
                        )}
                        <button
                          onClick={() => uncheckAll(activePeriod)}
                          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg"
                        >
                          Tout décocher
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Send to Picnic */}
                  {totalItems > 0 && (
                    <div className="print:hidden">
                      <button
                        onClick={() => setShowPicnicModal(true)}
                        disabled={!picnicConnected || sendableItems.length === 0}
                        title={
                          !picnicConnected
                            ? 'Connectez Picnic dans les paramètres'
                            : sendableItems.length === 0
                            ? 'Aucun article à envoyer (tout est coché)'
                            : undefined
                        }
                        className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        🛒 Envoyer à Picnic
                        {sendableItems.length > 0 && picnicConnected && (
                          <span className="text-xs font-normal opacity-90">({sendableItems.length})</span>
                        )}
                      </button>
                      {picnicConnected === false && (
                        <p className="text-xs text-gray-400 text-center mt-1.5">
                          <Link href="/settings" className="underline hover:text-gray-600">Connectez Picnic</Link> dans les paramètres pour activer.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Categories */}
                  {totalItems > 0 && (
                    <div className="space-y-4">
                      {current.categories.map((cat) => (
                        <div key={cat.category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat.category}</h3>
                          </div>
                          <ul>
                            {cat.ingredients.map((ing, idx) => {
                              const key = itemKey(ing.name, ing.unit)
                              const isChecked = currentChecked.has(key)
                              return (
                                <li
                                  key={idx}
                                  onClick={() => toggleItem(activePeriod, key)}
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
                                      <span className="text-gray-500 mr-1">
                                        {formatQty(ing.quantity)}{ing.unit ? ` ${ing.unit}` : ''}
                                      </span>
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
                  )}

                  {/* Placard — shared across tabs, collapsed by default, muted styling */}
                  {(placardItems.length > 0 || placardLoading) && (
                    <div className="rounded-xl border border-gray-100 overflow-hidden">
                      <button
                        onClick={() => setPlacardOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
                            🧂 Placard
                          </span>
                          {placardLoading ? (
                            <span className="text-xs text-gray-300">Chargement…</span>
                          ) : (
                            <span className="text-xs text-gray-400 truncate">
                              {placardItems.length} ingrédient{placardItems.length > 1 ? 's' : ''} · à vérifier si nécessaire
                            </span>
                          )}
                        </div>
                        <span className="text-gray-300 text-xs ml-2 shrink-0">{placardOpen ? '▲' : '▼'}</span>
                      </button>

                      {placardOpen && !placardLoading && (
                        <ul className="bg-white">
                          {placardItems.map((ing, idx) => {
                            const key = itemKey(ing.name, ing.unit)
                            const isChecked = placardChecked.has(key)
                            return (
                              <li
                                key={idx}
                                onClick={() => togglePlacardItem(key)}
                                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                  idx < placardItems.length - 1 ? 'border-b border-gray-50' : ''
                                } ${isChecked ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  isChecked ? 'bg-gray-300 border-gray-300' : 'border-gray-200'
                                }`}>
                                  {isChecked && <span className="text-white text-xs font-bold">✓</span>}
                                </div>
                                <span className={`flex-1 text-sm transition-colors ${isChecked ? 'line-through text-gray-300' : 'text-gray-400'}`}>
                                  {formatQty(ing.quantity) && (
                                    <span className="mr-1">
                                      {formatQty(ing.quantity)}{ing.unit ? ` ${ing.unit}` : ''}
                                    </span>
                                  )}
                                  {ing.name}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Picnic review modal */}
      {showPicnicModal && (
        <PicnicReviewModal
          ingredients={sendableItems}
          period={activePeriod}
          onClose={() => setShowPicnicModal(false)}
        />
      )}
    </div>
  )
}
