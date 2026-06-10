'use client'

import { useEffect, useState } from 'react'
import { Ingredient } from '@/types/database'

function formatQty(q: number | null) {
  if (q === null) return ''
  const r = Math.round(q * 100) / 100
  return r % 1 === 0 ? r.toString() : r.toString()
}

interface RowProps {
  ing: Ingredient
  isEditing: boolean
  isLast: boolean
  onStartEdit: () => void
  onSave: (draft: { name: string; quantity: number | null; unit: string | null }) => void
  onDelete: () => void
}

function IngredientRow({ ing, isEditing, isLast, onStartEdit, onSave, onDelete }: RowProps) {
  const [name, setName] = useState(ing.name)
  const [qty, setQty] = useState(ing.quantity != null ? String(ing.quantity) : '')
  const [unit, setUnit] = useState(ing.unit ?? '')

  useEffect(() => {
    if (isEditing) {
      setName(ing.name)
      setQty(ing.quantity != null ? String(ing.quantity) : '')
      setUnit(ing.unit ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing])

  function commit() {
    const n = name.trim()
    if (!n) { onDelete(); return }
    onSave({ name: n, quantity: qty === '' ? null : (parseFloat(qty) || null), unit: unit.trim() || null })
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
  }
  function onBlurWrap(e: React.FocusEvent<HTMLLIElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit()
  }

  const border = isLast ? '' : 'border-b border-gray-50'

  if (isEditing) {
    return (
      <li className={`px-1 py-2 ${border}`} onBlur={onBlurWrap}>
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
            type="text" value={name} placeholder="Ingrédient" autoFocus
            onChange={(e) => setName(e.target.value)} onKeyDown={onKey}
            className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button onClick={onDelete} aria-label="Supprimer" className="shrink-0 text-gray-300 hover:text-red-500 text-lg leading-none px-1">✕</button>
        </div>
      </li>
    )
  }

  return (
    <li className={border}>
      <button onClick={onStartEdit} className="w-full flex gap-2 text-left text-sm text-gray-700 py-1.5 hover:text-green-700 transition-colors">
        {(ing.quantity !== null || ing.unit) && (
          <span className="text-gray-500 shrink-0">
            {formatQty(ing.quantity)}{ing.unit ? ` ${ing.unit}` : ''}
          </span>
        )}
        <span>{ing.name}</span>
      </button>
    </li>
  )
}

interface EditorProps {
  recipeId: string
  ingredients: Ingredient[]
  defaultServings: number
  onChange: (ings: Ingredient[]) => void
}

export default function RecipeIngredientsEditor({ recipeId, ingredients, defaultServings, onChange }: EditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addName, setAddName] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addUnit, setAddUnit] = useState('')
  const [busy, setBusy] = useState(false)

  async function saveEdit(ing: Ingredient, draft: { name: string; quantity: number | null; unit: string | null }) {
    setEditingId(null)
    // Optimistic update
    onChange(ingredients.map((i) => (i.id === ing.id ? { ...i, ...draft } : i)))
    try {
      await fetch(`/api/recipes/${recipeId}/ingredients/${ing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
    } catch {
      // best-effort; UI already reflects the change
    }
  }

  async function deleteIngredient(ing: Ingredient) {
    setEditingId(null)
    onChange(ingredients.filter((i) => i.id !== ing.id))
    try {
      await fetch(`/api/recipes/${recipeId}/ingredients/${ing.id}`, { method: 'DELETE' })
    } catch {}
  }

  async function addIngredient() {
    const name = addName.trim()
    if (!name || busy) return
    setBusy(true)
    const payload = {
      name,
      quantity: addQty === '' ? null : (parseFloat(addQty) || null),
      unit: addUnit.trim() || null,
    }
    try {
      const res = await fetch(`/api/recipes/${recipeId}/ingredients/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok && data.ingredient) {
        onChange([...ingredients, data.ingredient as Ingredient])
        setAddName(''); setAddQty(''); setAddUnit('')
      }
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {ingredients.length > 0 ? (
        <>
          <p className="text-xs text-gray-400 mb-1">Pour {defaultServings} personne{defaultServings > 1 ? 's' : ''}</p>
          <ul>
            {ingredients.map((ing, idx) => (
              <IngredientRow
                key={ing.id}
                ing={ing}
                isEditing={editingId === ing.id}
                isLast={idx === ingredients.length - 1}
                onStartEdit={() => setEditingId(ing.id)}
                onSave={(d) => saveEdit(ing, d)}
                onDelete={() => deleteIngredient(ing)}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-gray-400 mb-1">Aucun ingrédient. Utilisez « Importer » ci-dessus ou ajoutez-en un.</p>
      )}

      {/* Add an ingredient */}
      {showAddForm ? (
        <div className="mt-2 space-y-2">
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
              type="text" value={addName} placeholder="Ingrédient" autoFocus
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient() } }}
              className="flex-1 min-w-0 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addIngredient}
              disabled={!addName.trim() || busy}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {busy ? 'Ajout…' : 'Ajouter'}
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
          className="mt-2 w-full py-2 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 text-xs font-medium hover:border-green-400 hover:text-green-600 transition-colors"
        >
          + Ajouter un ingrédient
        </button>
      )}
    </div>
  )
}
