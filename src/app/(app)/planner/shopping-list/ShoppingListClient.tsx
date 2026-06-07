'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingCategory, ShoppingItem } from '@/types/database'
import { fromDateString } from '@/lib/weeks'
import { loadSelection, saveSelection, ShoppingSelection } from '@/lib/shoppingSelection'
import DayPickerModal from '@/components/ui/DayPickerModal'
import PicnicReviewModal from '@/components/ui/PicnicReviewModal'

const PLACARD_CATEGORY = 'Placard'
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function shortDate(date: string): string {
  const d = fromDateString(date)
  return `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}

function rangeLabel(sel: ShoppingSelection): string {
  return sel.firstDate === sel.lastDate
    ? `Liste du ${shortDate(sel.firstDate)}`
    : `Liste du ${shortDate(sel.firstDate)} au ${shortDate(sel.lastDate)}`
}

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
  const [selection, setSelection] = useState<ShoppingSelection | null>(null)
  const [selectionLoaded, setSelectionLoaded] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)

  const [categories, setCategories] = useState<ShoppingCategory[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [placardChecked, setPlacardChecked] = useState<Set<string>>(new Set())
  const [placardOpen, setPlacardOpen] = useState(false)

  const [picnicConnected, setPicnicConnected] = useState<boolean | null>(null)
  const [showPicnicModal, setShowPicnicModal] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // localStorage key is derived from the selected meal ids (order-independent).
  const baseKey = selection ? `shopping-${[...selection.recipeIds].sort().join(',')}` : ''

  useEffect(() => {
    const sel = loadSelection()
    setSelection(sel)
    setSelectionLoaded(true)
    if (!sel) setLoading(false)
    // A valid household plan id for the route path (selection can span weeks).
    fetch('/api/meal-plans/current')
      .then((r) => r.json())
      .then((d) => setPlanId(d.id ?? null))
      .catch(() => { setError('Plan introuvable'); setLoading(false) })
    fetch('/api/picnic/status')
      .then((r) => r.json())
      .then((d) => setPicnicConnected(!!d.connected))
      .catch(() => setPicnicConnected(false))
  }, [])

  useEffect(() => {
    if (!selection) {
      setChecked(new Set())
      setPlacardChecked(new Set())
      return
    }
    setChecked(loadChecked(baseKey))
    setPlacardChecked(loadChecked(`${baseKey}-placard`))
  }, [baseKey, selection])

  const fetchList = useCallback(async (pid: string, sel: ShoppingSelection) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meal-plans/${pid}/shopping-list?recipe_ids=${sel.recipeIds.join(',')}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCategories(data.categories ?? [])
      setMissing(data.missing_recipes ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (planId && selection) fetchList(planId, selection)
  }, [planId, selection, fetchList])

  function handlePickerConfirm(sel: ShoppingSelection) {
    saveSelection(sel)
    setLoading(true)
    setSelection(sel)
    setShowPicker(false)
  }

  function toggleItem(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveChecked(baseKey, next)
      return next
    })
  }

  function togglePlacardItem(key: string) {
    setPlacardChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveChecked(`${baseKey}-placard`, next)
      return next
    })
  }

  function uncheckAll() {
    saveChecked(baseKey, new Set())
    setChecked(new Set())
  }

  const placardItems = categories.find((c) => c.category === PLACARD_CATEGORY)?.ingredients ?? []
  const mainCategories = categories.filter((c) => c.category !== PLACARD_CATEGORY)
  const totalItems = mainCategories.reduce((s, c) => s + c.ingredients.length, 0)

  // Items sent to Picnic: non-Placard and not checked off (a checked item means
  // the user already has it). Placard staples are never ordered.
  const sendableItems: ShoppingItem[] = mainCategories
    .flatMap((c) => c.ingredients)
    .filter((ing) => !checked.has(itemKey(ing.name, ing.unit)))

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/planner" className="text-gray-400 hover:text-gray-600 text-sm">← Retour</Link>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-900 truncate">Liste de courses</h2>
          {selection && <p className="text-xs text-gray-500">{rangeLabel(selection)}</p>}
        </div>
        {selection && (
          <button
            onClick={() => setShowPicker(true)}
            className="text-xs text-green-600 hover:text-green-700 font-medium whitespace-nowrap"
          >
            🔄 Modifier les jours
          </button>
        )}
      </div>

      {!selectionLoaded ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !selection ? (
        /* Empty state — no list generated yet */
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🛒</div>
          <p className="font-medium text-gray-700">Créer ma liste de courses</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">Choisissez les jours à inclure dans votre liste.</p>
          <button
            onClick={() => setShowPicker(true)}
            className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            Choisir les jours →
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Claude prépare la liste…</p>
        </div>
      ) : error ? (
        <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
          {planId && (
            <button onClick={() => fetchList(planId, selection)} className="ml-2 underline">Réessayer</button>
          )}
        </div>
      ) : (
        <>
          {/* Recipes with no ingredients */}
          {missing.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <p className="font-medium mb-1">⚠️ Ces recettes n&apos;ont pas d&apos;ingrédients :</p>
              <p className="text-xs text-amber-700">{missing.join(', ')}</p>
            </div>
          )}

          {totalItems === 0 && placardItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium">Aucun ingrédient pour ces jours</p>
              <p className="text-sm mt-1">Les recettes sélectionnées n&apos;ont pas d&apos;ingrédients.</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              {totalItems > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {checked.size}/{totalItems} article{totalItems > 1 ? 's' : ''} cochés
                  </p>
                  <div className="flex items-center gap-3">
                    {planId && (
                      <button
                        onClick={() => fetchList(planId, selection)}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        ↻ Regénérer
                      </button>
                    )}
                    <button
                      onClick={uncheckAll}
                      className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>
              )}

              {/* Send to Picnic */}
              {totalItems > 0 && (
                <div>
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
                  {mainCategories.map((cat) => (
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

              {/* Placard — collapsed by default, muted styling */}
              {placardItems.length > 0 && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setPlacardOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">🧂 Placard</span>
                      <span className="text-xs text-gray-400 truncate">
                        {placardItems.length} ingrédient{placardItems.length > 1 ? 's' : ''} · à vérifier si nécessaire
                      </span>
                    </div>
                    <span className="text-gray-300 text-xs ml-2 shrink-0">{placardOpen ? '▲' : '▼'}</span>
                  </button>

                  {placardOpen && (
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

      {/* Day picker */}
      {showPicker && (
        <DayPickerModal
          initialRecipeIds={selection?.recipeIds}
          onClose={() => setShowPicker(false)}
          onConfirm={handlePickerConfirm}
        />
      )}

      {/* Picnic review modal */}
      {showPicnicModal && selection && (
        <PicnicReviewModal
          ingredients={sendableItems}
          period={rangeLabel(selection)}
          onClose={() => setShowPicnicModal(false)}
        />
      )}
    </div>
  )
}
