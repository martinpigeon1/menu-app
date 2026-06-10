'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingCategory, ShoppingItem } from '@/types/database'
import { fromDateString } from '@/lib/weeks'
import { loadSelection, saveSelection, ShoppingSelection } from '@/lib/shoppingSelection'
import DayPickerModal from '@/components/ui/DayPickerModal'
import PicnicReviewModal from '@/components/ui/PicnicReviewModal'

const PLACARD_CATEGORY = 'Placard'
const MANUAL_CATEGORY = '🖊️ Ajouts manuels'
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

interface RowItem { key: string; name: string; quantity: number | null; unit: string | null }
interface ManualItem { id: string; name: string; quantity: number | null; unit: string | null }
interface EditDraft { name: string; quantity: number | null; unit: string | null }

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

function loadSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return new Set(JSON.parse(raw))
  } catch {}
  return new Set()
}
function loadObj(storageKey: string): Record<string, EditDraft> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}
function loadArr(storageKey: string): ManualItem[] {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}
function saveJSON(storageKey: string, val: unknown) {
  try { localStorage.setItem(storageKey, JSON.stringify(val)) } catch {}
}

// ── One ingredient row: tap the checkbox to check, tap the text to edit ──
function EditableRow({
  item, isChecked, isEditing, muted, isLast, onToggleCheck, onStartEdit, onSave, onDelete,
}: {
  item: RowItem
  isChecked: boolean
  isEditing: boolean
  muted?: boolean
  isLast: boolean
  onToggleCheck: () => void
  onStartEdit: () => void
  onSave: (draft: EditDraft) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(item.name)
  const [qty, setQty] = useState(item.quantity != null ? String(item.quantity) : '')
  const [unit, setUnit] = useState(item.unit ?? '')

  useEffect(() => {
    if (isEditing) {
      setName(item.name)
      setQty(item.quantity != null ? String(item.quantity) : '')
      setUnit(item.unit ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  function commit() {
    const n = name.trim()
    if (!n) { onDelete(); return } // clearing the name deletes the item
    onSave({ name: n, quantity: qty === '' ? null : (parseFloat(qty) || null), unit: unit.trim() || null })
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
  }
  // Save when focus leaves the whole row (tap elsewhere).
  function onBlurWrap(e: React.FocusEvent<HTMLLIElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit()
  }

  const border = isLast ? '' : 'border-b border-gray-50'

  if (isEditing) {
    return (
      <li className={`px-3 py-2 ${border} bg-green-50/40`} onBlur={onBlurWrap}>
        <div className="flex items-center gap-2">
          <input
            type="number" inputMode="decimal" value={qty} placeholder="Qté"
            onChange={(e) => setQty(e.target.value)} onKeyDown={onKey}
            className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            type="text" value={unit} placeholder="Unité"
            onChange={(e) => setUnit(e.target.value)} onKeyDown={onKey}
            className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <input
            type="text" value={name} placeholder="Article" autoFocus
            onChange={(e) => setName(e.target.value)} onKeyDown={onKey}
            className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button onClick={onDelete} aria-label="Supprimer" className="shrink-0 text-gray-300 hover:text-red-500 text-lg leading-none px-1">✕</button>
        </div>
      </li>
    )
  }

  return (
    <li className={`flex items-center gap-3 px-4 py-3 ${border} ${isChecked ? 'bg-gray-50' : ''}`}>
      <button
        onClick={onToggleCheck}
        aria-label={isChecked ? 'Décocher' : 'Cocher'}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
          isChecked
            ? (muted ? 'bg-gray-300 border-gray-300' : 'bg-green-600 border-green-600')
            : (muted ? 'border-gray-200' : 'border-gray-300')
        }`}
      >
        {isChecked && <span className="text-white text-xs font-bold">✓</span>}
      </button>
      <button onClick={onStartEdit} className="flex-1 min-w-0 text-left">
        <span className={`text-sm transition-colors ${
          isChecked
            ? (muted ? 'line-through text-gray-300' : 'line-through text-gray-400')
            : (muted ? 'text-gray-400' : 'text-gray-700')
        }`}>
          {formatQty(item.quantity) && (
            <span className={muted ? 'mr-1' : 'text-gray-500 mr-1'}>
              {formatQty(item.quantity)}{item.unit ? ` ${item.unit}` : ''}
            </span>
          )}
          {item.name}
        </span>
      </button>
    </li>
  )
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

  // Inline edits / deletions / manual additions (all localStorage-persisted).
  const [edits, setEdits] = useState<Record<string, EditDraft>>({})
  const [deleted, setDeleted] = useState<Set<string>>(new Set())
  const [manual, setManual] = useState<ManualItem[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addUnit, setAddUnit] = useState('')

  const [picnicConnected, setPicnicConnected] = useState<boolean | null>(null)
  const [showPicnicModal, setShowPicnicModal] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // localStorage keys are derived from the selected meal ids (order-independent).
  const baseKey = selection ? `shopping-${[...selection.recipeIds].sort().join(',')}` : ''

  useEffect(() => {
    const sel = loadSelection()
    setSelection(sel)
    setSelectionLoaded(true)
    if (!sel) setLoading(false)
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
      setChecked(new Set()); setPlacardChecked(new Set())
      setEdits({}); setDeleted(new Set()); setManual([])
      return
    }
    setChecked(loadSet(baseKey))
    setPlacardChecked(loadSet(`${baseKey}-placard`))
    setEdits(loadObj(`${baseKey}-edits`))
    setDeleted(loadSet(`${baseKey}-deleted`))
    setManual(loadArr(`${baseKey}-manual`))
    setEditingKey(null)
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
      if (next.has(key)) next.delete(key); else next.add(key)
      saveJSON(baseKey, [...next])
      return next
    })
  }
  function togglePlacardItem(key: string) {
    setPlacardChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      saveJSON(`${baseKey}-placard`, [...next])
      return next
    })
  }
  function uncheckAll() {
    saveJSON(baseKey, [])
    setChecked(new Set())
  }

  // ── Edit / delete / manual add ──
  function applyEdit(key: string, draft: EditDraft, isManual: boolean) {
    if (isManual) {
      const next = manual.map((m) => (m.id === key ? { ...m, name: draft.name, quantity: draft.quantity, unit: draft.unit } : m))
      setManual(next); saveJSON(`${baseKey}-manual`, next)
    } else {
      const next = { ...edits, [key]: draft }
      setEdits(next); saveJSON(`${baseKey}-edits`, next)
    }
    setEditingKey(null)
  }
  function deleteRow(key: string, isManual: boolean) {
    if (isManual) {
      const next = manual.filter((m) => m.id !== key)
      setManual(next); saveJSON(`${baseKey}-manual`, next)
    } else {
      const next = new Set(deleted); next.add(key)
      setDeleted(next); saveJSON(`${baseKey}-deleted`, [...next])
    }
    setEditingKey(null)
  }
  function addManualItem() {
    const name = addName.trim()
    if (!name) return
    const item: ManualItem = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      quantity: addQty === '' ? null : (parseFloat(addQty) || null),
      unit: addUnit.trim() || null,
    }
    const next = [...manual, item]
    setManual(next); saveJSON(`${baseKey}-manual`, next)
    setAddName(''); setAddQty(''); setAddUnit('')
  }
  function regenerate() {
    try {
      localStorage.removeItem(`${baseKey}-edits`)
      localStorage.removeItem(`${baseKey}-deleted`)
      localStorage.removeItem(`${baseKey}-manual`)
    } catch {}
    setEdits({}); setDeleted(new Set()); setManual([]); setEditingKey(null); setShowAddForm(false)
    if (planId && selection) fetchList(planId, selection)
  }

  // ── Resolve API categories through edits/deletions ──
  function resolveItems(ings: ShoppingItem[]): RowItem[] {
    const out: RowItem[] = []
    for (const ing of ings) {
      const key = itemKey(ing.name, ing.unit)
      if (deleted.has(key)) continue
      const ov = edits[key]
      out.push(ov ? { key, name: ov.name, quantity: ov.quantity, unit: ov.unit } : { key, name: ing.name, quantity: ing.quantity, unit: ing.unit })
    }
    return out
  }

  const rawPlacard = categories.find((c) => c.category === PLACARD_CATEGORY)?.ingredients ?? []
  const rawMain = categories.filter((c) => c.category !== PLACARD_CATEGORY)
  const resolvedMain = rawMain
    .map((c) => ({ category: c.category, items: resolveItems(c.ingredients) }))
    .filter((c) => c.items.length > 0)
  const resolvedPlacard = resolveItems(rawPlacard)
  const manualItems: RowItem[] = manual.map((m) => ({ key: m.id, name: m.name, quantity: m.quantity, unit: m.unit }))

  // Shoppable = everything except Placard staples.
  const shoppable = [...resolvedMain.flatMap((c) => c.items), ...manualItems]
  const totalItems = shoppable.length
  const checkedCount = shoppable.filter((it) => checked.has(it.key)).length
  const hasAny = totalItems > 0 || resolvedPlacard.length > 0

  // Picnic reads the final edited state: edited + manual items, minus checked.
  const sendableItems: ShoppingItem[] = shoppable
    .filter((it) => !checked.has(it.key))
    .map((it) => ({ name: it.name, quantity: it.quantity, unit: it.unit }))

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
          {missing.length > 0 && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <p className="font-medium mb-1">⚠️ Ces recettes n&apos;ont pas d&apos;ingrédients :</p>
              <p className="text-xs text-amber-700">{missing.join(', ')}</p>
            </div>
          )}

          {!hasAny ? (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium">Aucun ingrédient pour ces jours</p>
              <p className="text-sm mt-1">Ajoutez un article manuellement ci-dessous.</p>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              {totalItems > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    {checkedCount}/{totalItems} article{totalItems > 1 ? 's' : ''} cochés
                  </p>
                  <div className="flex items-center gap-3">
                    <button onClick={regenerate} className="text-xs text-green-600 hover:text-green-700">
                      ↻ Regénérer
                    </button>
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

              {/* Main categories */}
              {resolvedMain.map((cat) => (
                <div key={cat.category} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{cat.category}</h3>
                  </div>
                  <ul>
                    {cat.items.map((it, idx) => (
                      <EditableRow
                        key={it.key}
                        item={it}
                        isChecked={checked.has(it.key)}
                        isEditing={editingKey === it.key}
                        isLast={idx === cat.items.length - 1}
                        onToggleCheck={() => toggleItem(it.key)}
                        onStartEdit={() => setEditingKey(it.key)}
                        onSave={(d) => applyEdit(it.key, d, false)}
                        onDelete={() => deleteRow(it.key, false)}
                      />
                    ))}
                  </ul>
                </div>
              ))}

              {/* Manual additions */}
              {manualItems.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{MANUAL_CATEGORY}</h3>
                  </div>
                  <ul>
                    {manualItems.map((it, idx) => (
                      <EditableRow
                        key={it.key}
                        item={it}
                        isChecked={checked.has(it.key)}
                        isEditing={editingKey === it.key}
                        isLast={idx === manualItems.length - 1}
                        onToggleCheck={() => toggleItem(it.key)}
                        onStartEdit={() => setEditingKey(it.key)}
                        onSave={(d) => applyEdit(it.key, d, true)}
                        onDelete={() => deleteRow(it.key, true)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {/* Placard — collapsed by default, muted */}
              {resolvedPlacard.length > 0 && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setPlacardOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">🧂 Placard</span>
                      <span className="text-xs text-gray-400 truncate">
                        {resolvedPlacard.length} ingrédient{resolvedPlacard.length > 1 ? 's' : ''} · à vérifier si nécessaire
                      </span>
                    </div>
                    <span className="text-gray-300 text-xs ml-2 shrink-0">{placardOpen ? '▲' : '▼'}</span>
                  </button>
                  {placardOpen && (
                    <ul className="bg-white">
                      {resolvedPlacard.map((it, idx) => (
                        <EditableRow
                          key={it.key}
                          item={it}
                          muted
                          isChecked={placardChecked.has(it.key)}
                          isEditing={editingKey === it.key}
                          isLast={idx === resolvedPlacard.length - 1}
                          onToggleCheck={() => togglePlacardItem(it.key)}
                          onStartEdit={() => setEditingKey(it.key)}
                          onSave={(d) => applyEdit(it.key, d, false)}
                          onDelete={() => deleteRow(it.key, false)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}

          {/* Add a manual item — very bottom of the list */}
          {showAddForm ? (
            <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number" inputMode="decimal" value={addQty} placeholder="Qté"
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <input
                  type="text" value={addUnit} placeholder="Unité"
                  onChange={(e) => setAddUnit(e.target.value)}
                  className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                />
                <input
                  type="text" value={addName} placeholder="Article" autoFocus
                  onChange={(e) => setAddName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualItem() } }}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addManualItem}
                  disabled={!addName.trim()}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Ajouter
                </button>
                <button
                  onClick={() => { setShowAddForm(false); setAddName(''); setAddQty(''); setAddUnit('') }}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 text-sm font-medium hover:border-green-400 hover:text-green-600 transition-colors"
            >
              + Ajouter un article
            </button>
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
