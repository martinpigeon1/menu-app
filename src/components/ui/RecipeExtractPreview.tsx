'use client'

import { useState } from 'react'
import { RecipeType } from '@/types/database'
import StarRating from '@/components/ui/StarRating'

const TYPES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']

export interface ExtractedIngredient {
  name: string
  quantity: number | null
  unit: string | null
}

export interface ExtractedStep {
  step_number: number
  text: string
}

/** Shape returned by POST /api/recipes/extract. */
export interface ExtractResult {
  name: string
  author: string | null
  source_book: string | null
  source_url: string | null
  type: string
  servings: number
  prep_minutes: number | null
  cook_minutes: number | null
  ingredients: ExtractedIngredient[]
  steps: ExtractedStep[]
  notes: string | null
  is_cookidoo: boolean
}

/** Reviewed data emitted on save. */
export interface ReviewedRecipe {
  name: string
  author: string | null
  source_book: string | null
  source_url: string | null
  type: RecipeType
  servings: number
  prep_minutes: number | null
  cook_minutes: number | null
  rating: number | null
  notes: string | null
  ingredients: ExtractedIngredient[]
  steps: ExtractedStep[]
  is_cookidoo: boolean
}

interface RecipeExtractPreviewProps {
  initial: ExtractResult
  /** Existing rating to pre-fill (update context). */
  initialRating?: number | null
  context: 'create' | 'update'
  existingIngredientCount?: number
  existingStepCount?: number
  saving: boolean
  error?: string | null
  onClose: () => void
  onSave: (data: ReviewedRecipe) => void
}

export default function RecipeExtractPreview({
  initial,
  initialRating = null,
  context,
  existingIngredientCount = 0,
  existingStepCount = 0,
  saving,
  error,
  onClose,
  onSave,
}: RecipeExtractPreviewProps) {
  const [name, setName] = useState(initial.name ?? '')
  const [author, setAuthor] = useState(initial.author ?? '')
  const [sourceBook, setSourceBook] = useState(initial.source_book ?? '')
  const [type, setType] = useState<RecipeType>(
    (TYPES.includes(initial.type as RecipeType) ? initial.type : 'Plat') as RecipeType
  )
  const [servings, setServings] = useState(initial.servings || 4)
  const [prepMinutes, setPrepMinutes] = useState(initial.prep_minutes?.toString() ?? '')
  const [cookMinutes, setCookMinutes] = useState(initial.cook_minutes?.toString() ?? '')
  const [rating, setRating] = useState<number | null>(initialRating)
  const [notes, setNotes] = useState(initial.notes ?? '')
  const [ingredients, setIngredients] = useState<ExtractedIngredient[]>(initial.ingredients ?? [])
  const [steps, setSteps] = useState<ExtractedStep[]>(initial.steps ?? [])
  const [nameError, setNameError] = useState(false)

  const isCookidoo = initial.is_cookidoo
  const sourceUrl = initial.source_url

  function updateIngredient(i: number, field: keyof ExtractedIngredient, value: string) {
    setIngredients((prev) => {
      const updated = [...prev]
      if (field === 'quantity') {
        updated[i] = { ...updated[i], quantity: value === '' ? null : parseFloat(value) || null }
      } else {
        updated[i] = { ...updated[i], [field]: value || null }
      }
      return updated
    })
  }
  const removeIngredient = (i: number) => setIngredients((p) => p.filter((_, idx) => idx !== i))
  const addIngredient = () => setIngredients((p) => [...p, { name: '', quantity: null, unit: null }])

  function updateStep(i: number, value: string) {
    setSteps((prev) => {
      const updated = [...prev]
      updated[i] = { ...updated[i], text: value }
      return updated
    })
  }
  const removeStep = (i: number) => setSteps((p) => p.filter((_, idx) => idx !== i))
  const addStep = () => setSteps((p) => [...p, { step_number: p.length + 1, text: '' }])

  function handleSave() {
    if (!name.trim()) {
      setNameError(true)
      return
    }
    onSave({
      name: name.trim(),
      author: author.trim() || null,
      source_book: sourceBook.trim() || null,
      source_url: sourceUrl,
      type,
      servings,
      prep_minutes: prepMinutes ? parseInt(prepMinutes) : null,
      cook_minutes: cookMinutes ? parseInt(cookMinutes) : null,
      rating,
      notes: notes.trim() || null,
      ingredients,
      steps: steps.map((s, i) => ({ step_number: i + 1, text: s.text })),
      is_cookidoo: isCookidoo,
    })
  }

  const hasExisting = existingIngredientCount > 0 || existingStepCount > 0
  const saveLabel =
    context === 'create'
      ? `💾 Créer la recette · ${ingredients.length} ing · ${steps.length} étapes`
      : `💾 Mettre à jour · ${ingredients.length} ing · ${steps.length} étapes`

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Vérifier la recette</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-28">
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        {/* METADATA */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(false) }}
              placeholder="Nom de la recette"
              className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${nameError ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}
            />
            {nameError && <p className="text-xs text-red-500 mt-1">Le nom est obligatoire.</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Auteur</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Yummix, Claire au Matcha…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Livre / Source</label>
            <input
              type="text"
              value={sourceBook}
              onChange={(e) => setSourceBook(e.target.value)}
              placeholder="Simple & healthy…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {sourceUrl && (
              <p className="text-xs text-gray-400 mt-1 truncate">URL : {sourceUrl}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RecipeType)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Portions</label>
              <input
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prépa (min)</label>
              <input
                type="number"
                min={1}
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuisson</label>
              <input
                type="number"
                min={1}
                value={cookMinutes}
                onChange={(e) => setCookMinutes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
            <StarRating value={rating} onChange={setRating} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Remarques, variantes…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
        </div>

        {/* INGRÉDIENTS */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Ingrédients ({ingredients.length})
          </p>
          {ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="number"
                value={ing.quantity ?? ''}
                placeholder="Qté"
                onChange={(e) => updateIngredient(i, 'quantity', e.target.value)}
                className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <input
                type="text"
                value={ing.unit ?? ''}
                placeholder="Unité"
                onChange={(e) => updateIngredient(i, 'unit', e.target.value)}
                className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <input
                type="text"
                value={ing.name}
                placeholder="Ingrédient"
                onChange={(e) => updateIngredient(i, 'name', e.target.value)}
                className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
              />
              <button onClick={() => removeIngredient(i)} className="text-gray-300 hover:text-red-400 text-lg leading-none px-1">×</button>
            </div>
          ))}
          <button onClick={addIngredient} className="text-xs text-green-600 hover:text-green-700 font-medium">
            + Ajouter un ingrédient
          </button>
        </div>

        {/* ÉTAPES */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Étapes ({steps.length})
          </p>
          {isCookidoo ? (
            <p className="text-sm text-gray-600">
              🌐 Les étapes sont disponibles sur Cookidoo et votre Thermomix
            </p>
          ) : (
            <>
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="mt-2 w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full bg-green-100 text-green-700 text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <textarea
                    value={step.text}
                    onChange={(e) => updateStep(i, e.target.value)}
                    rows={2}
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-green-500 resize-none"
                  />
                  <button onClick={() => removeStep(i)} className="text-gray-300 hover:text-red-400 text-lg leading-none px-1 mt-1">×</button>
                </div>
              ))}
              <button onClick={addStep} className="text-xs text-green-600 hover:text-green-700 font-medium">
                + Ajouter une étape
              </button>
              {steps.length > 0 && (
                <p className="text-[11px] text-gray-400">
                  Les quantités entre [[ ]] s&apos;adaptent aux portions à l&apos;affichage.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto space-y-2">
          {context === 'update' && hasExisting && (
            <p className="text-xs text-amber-600">
              ⚠️ Remplacera les {existingIngredientCount} ingrédient{existingIngredientCount !== 1 ? 's' : ''} et {existingStepCount} étape{existingStepCount !== 1 ? 's' : ''} existants
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
