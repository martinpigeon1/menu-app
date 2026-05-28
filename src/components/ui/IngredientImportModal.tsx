'use client'

import { useRef, useState } from 'react'

export interface ExtractedIngredient {
  name: string
  quantity: number | null
  unit: string | null
}

interface IngredientImportModalProps {
  recipeId: string
  sourceUrl: string | null
  onSaved: (servings: number, ingredients: ExtractedIngredient[]) => void
  onClose: () => void
}

type Mode = 'choose' | 'loading' | 'preview' | 'saving'

export default function IngredientImportModal({
  recipeId,
  sourceUrl,
  onSaved,
  onClose,
}: IngredientImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>('choose')
  const [error, setError] = useState<string | null>(null)
  const [servings, setServings] = useState(4)
  const [ingredients, setIngredients] = useState<ExtractedIngredient[]>([])

  const isCookidoo = sourceUrl?.includes('cookidoo')

  async function extractFromPhoto(file: File) {
    setMode('loading')
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(`/api/recipes/${recipeId}/ingredients/extract-photo`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'analyse')
        setMode('choose')
        return
      }
      setServings(data.default_servings ?? 4)
      setIngredients(data.ingredients ?? [])
      setMode('preview')
    } catch {
      setError('Erreur réseau.')
      setMode('choose')
    }
  }

  async function extractFromUrl() {
    if (!sourceUrl) return
    setMode('loading')
    setError(null)
    try {
      const res = await fetch(`/api/recipes/${recipeId}/ingredients/extract-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'extraction')
        setMode('choose')
        return
      }
      setServings(data.default_servings ?? 4)
      setIngredients(data.ingredients ?? [])
      setMode('preview')
    } catch {
      setError('Erreur réseau.')
      setMode('choose')
    }
  }

  async function handleSave() {
    setMode('saving')
    try {
      const res = await fetch(`/api/recipes/${recipeId}/ingredients/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_servings: servings, ingredients }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de la sauvegarde')
        setMode('preview')
        return
      }
      onSaved(servings, ingredients)
    } catch {
      setError('Erreur réseau.')
      setMode('preview')
    }
  }

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

  function removeIngredient(i: number) {
    setIngredients((prev) => prev.filter((_, idx) => idx !== i))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50">
      <div className="flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-2xl sm:bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Importer les ingrédients</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {mode === 'choose' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">
                Choisissez comment importer les ingrédients.
              </p>

              {/* Photo button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <span className="text-2xl">📷</span>
                <div>
                  <p className="font-medium text-gray-800 text-sm">Importer depuis photo</p>
                  <p className="text-xs text-gray-500">Prends une photo de la recette</p>
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) extractFromPhoto(file)
                  e.target.value = ''
                }}
              />

              {/* URL button */}
              {sourceUrl ? (
                <button
                  onClick={extractFromUrl}
                  disabled={!!isCookidoo}
                  title={isCookidoo ? 'Extraction indisponible pour Cookidoo' : undefined}
                  className="w-full flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-2xl">🔗</span>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">Récupérer depuis l&apos;URL</p>
                    <p className="text-xs text-gray-500 truncate max-w-[240px]">
                      {isCookidoo ? 'Non disponible (Cookidoo)' : sourceUrl}
                    </p>
                  </div>
                </button>
              ) : (
                <div className="w-full flex items-center gap-3 px-4 py-3 border border-gray-100 rounded-xl opacity-40 cursor-not-allowed">
                  <span className="text-2xl">🔗</span>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">Récupérer depuis l&apos;URL</p>
                    <p className="text-xs text-gray-500">Aucune URL associée à cette recette</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Claude analyse la photo…</p>
            </div>
          )}

          {mode === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Portions :</label>
                <input
                  type="number"
                  value={servings}
                  min={1}
                  onChange={(e) => setServings(parseInt(e.target.value) || 4)}
                  className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {ingredients.length} ingrédient{ingredients.length !== 1 ? 's' : ''} — modifiables
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
                    <button
                      onClick={() => removeIngredient(i)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none px-1"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === 'saving' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Enregistrement…</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'preview' && (
          <div className="flex gap-3 p-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={ingredients.length === 0}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Sauvegarder {ingredients.length} ingrédient{ingredients.length !== 1 ? 's' : ''}
            </button>
            <button
              onClick={() => { setMode('choose'); setIngredients([]); setError(null) }}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Retour
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
