'use client'

import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { RecipeType } from '@/types/database'
import StarRating from '@/components/ui/StarRating'
import { ExtractedIngredient, ExtractedStep } from '@/components/ui/IngredientImportModal'

const TYPES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']

type Step = 'input' | 'loading' | 'preview' | 'error'
type Mode = 'photo' | 'url'

interface Extracted {
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
}

function CreerRecetteFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'url' ? 'url' : 'photo')
  const [step, setStep] = useState<Step>('input')
  const [error, setError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState(false)

  // Editable recipe fields
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [sourceBook, setSourceBook] = useState('')
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [type, setType] = useState<RecipeType>('Plat')
  const [servings, setServings] = useState(4)
  const [prepMinutes, setPrepMinutes] = useState('')
  const [cookMinutes, setCookMinutes] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [ingredients, setIngredients] = useState<ExtractedIngredient[]>([])
  const [steps, setSteps] = useState<ExtractedStep[]>([])

  const isCookidoo = !!sourceUrl?.includes('cookidoo')

  function applyExtraction(data: Extracted) {
    setName(data.name ?? '')
    setAuthor(data.author ?? '')
    setSourceBook(data.source_book ?? '')
    setSourceUrl(data.source_url ?? null)
    setType((TYPES.includes(data.type as RecipeType) ? data.type : 'Plat') as RecipeType)
    setServings(data.servings ?? 4)
    setPrepMinutes(data.prep_minutes?.toString() ?? '')
    setCookMinutes(data.cook_minutes?.toString() ?? '')
    setNotes(data.notes ?? '')
    setIngredients(data.ingredients ?? [])
    setSteps(data.steps ?? [])
    setStep('preview')
  }

  async function extractFromPhoto(file: File) {
    setStep('loading')
    setError(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/recipes/extract-from-photo', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'analyse de la photo.')
        setStep('error')
        return
      }
      applyExtraction(data)
    } catch {
      setError('Erreur réseau pendant l\'analyse.')
      setStep('error')
    }
  }

  async function extractFromUrl() {
    const trimmed = urlInput.trim()
    if (!trimmed) return

    // Cookidoo pages are protected (403) — no automatic analysis possible.
    // Skip the round-trip and go straight to a pre-filled preview.
    if (trimmed.includes('cookidoo')) {
      applyExtraction({
        name: '',
        author: 'Cookidoo',
        source_book: null,
        source_url: trimmed,
        type: 'Plat',
        servings: 4,
        prep_minutes: null,
        cook_minutes: null,
        ingredients: [],
        steps: [],
        notes: null,
      })
      return
    }

    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/recipes/extract-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'extraction de la page.')
        setStep('error')
        return
      }
      applyExtraction(data)
    } catch {
      setError('Erreur réseau pendant l\'extraction.')
      setStep('error')
    }
  }

  function retry() {
    setError(null)
    setStep('input')
  }

  async function handleSave() {
    if (!name.trim()) {
      setNameError(true)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/recipes/create-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          author: author.trim() || null,
          source_book: sourceBook.trim() || null,
          source_url: sourceUrl,
          type,
          default_servings: servings,
          prep_time_minutes: prepMinutes ? parseInt(prepMinutes) : null,
          cook_time_minutes: cookMinutes ? parseInt(cookMinutes) : null,
          rating,
          notes: notes.trim() || null,
          ingredients,
          steps: steps.map((s, i) => ({ step_number: i + 1, text: s.text })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de la sauvegarde.')
        setSaving(false)
        return
      }
      router.push(`/recettes/${data.recipe_id}`)
      router.refresh()
    } catch {
      setError('Erreur réseau pendant la sauvegarde.')
      setSaving(false)
    }
  }

  // Ingredient editing
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
  function addIngredient() {
    setIngredients((prev) => [...prev, { name: '', quantity: null, unit: null }])
  }

  // Step editing
  function updateStep(i: number, value: string) {
    setSteps((prev) => {
      const updated = [...prev]
      updated[i] = { ...updated[i], text: value }
      return updated
    })
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i))
  }
  function addStep() {
    setSteps((prev) => [...prev, { step_number: prev.length + 1, text: '' }])
  }

  // ---- INPUT ----
  if (step === 'input') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600">← Retour</Link>
          <h2 className="text-xl font-bold text-gray-900">Nouvelle recette</h2>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('photo')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === 'photo' ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            📷 Photo
          </button>
          <button
            onClick={() => setMode('url')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === 'url' ? 'bg-green-600 text-white border-green-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            🔗 URL
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {mode === 'photo' ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Prends une photo de la recette. Claude en extrait le titre, les
                ingrédients et les étapes automatiquement.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                📷 Prendre / choisir une photo
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
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Colle l&apos;URL de la recette (Yummix, Claire au Matcha, Cookidoo…).
              </p>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={extractFromUrl}
                disabled={!urlInput.trim()}
                className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Extraire
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          ou{' '}
          <Link href="/recettes/nouvelle" className="text-green-600 hover:underline">
            saisir manuellement
          </Link>
        </p>
      </div>
    )
  }

  // ---- LOADING ----
  if (step === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-600">Claude analyse la recette…</p>
        <p className="text-xs text-gray-400">Cela prend quelques secondes.</p>
      </div>
    )
  }

  // ---- ERROR ----
  if (step === 'error') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-gray-600">← Retour</Link>
          <h2 className="text-xl font-bold text-gray-900">Nouvelle recette</h2>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
            {error ?? 'Une erreur est survenue.'}
          </div>
          <div className="flex gap-3">
            <button
              onClick={retry}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Réessayer
            </button>
            <Link
              href="/recettes/nouvelle"
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center"
            >
              Saisir manuellement
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ---- PREVIEW ----
  return (
    <>
      <div className="space-y-5 pb-24">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('input')} className="text-gray-400 hover:text-gray-600 text-sm">← Recommencer</button>
          <h2 className="text-xl font-bold text-gray-900">Vérifier la recette</h2>
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        {isCookidoo && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg">
            Les recettes Cookidoo sont protégées : l&apos;analyse automatique n&apos;est pas
            possible. Renseignez au moins le <strong>nom</strong>, puis enregistrez. Les
            ingrédients et les étapes restent disponibles sur Cookidoo et votre Thermomix.
          </div>
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
            Ingrédients ({ingredients.length} extrait{ingredients.length !== 1 ? 's' : ''})
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
            Étapes ({steps.length} extraite{steps.length !== 1 ? 's' : ''})
          </p>
          {isCookidoo && steps.length === 0 ? (
            <p className="text-sm text-gray-500">Les étapes seront disponibles sur Cookidoo.</p>
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
      <div className="fixed bottom-16 inset-x-0 z-40 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {ingredients.length} ingrédient{ingredients.length !== 1 ? 's' : ''} · {steps.length} étape{steps.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Sauvegarde…' : '💾 Sauvegarder la recette'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function CreerRecettePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>}>
      <CreerRecetteFlow />
    </Suspense>
  )
}
