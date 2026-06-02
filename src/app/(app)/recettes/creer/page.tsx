'use client'

import { Suspense, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import RecipeExtractPreview, { ExtractResult, ReviewedRecipe } from '@/components/ui/RecipeExtractPreview'

type Step = 'input' | 'loading' | 'preview' | 'error'
type Mode = 'photo' | 'url'

function CreerRecetteFlow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'url' ? 'url' : 'photo')
  const [step, setStep] = useState<Step>('input')
  const [error, setError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [extracted, setExtracted] = useState<ExtractResult | null>(null)
  const [saving, setSaving] = useState(false)

  async function runExtract(init: RequestInit) {
    setStep('loading')
    setError(null)
    try {
      const res = await fetch('/api/recipes/extract', init)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'extraction.')
        setStep('error')
        return
      }
      setExtracted(data)
      setStep('preview')
    } catch {
      setError('Erreur réseau pendant l\'extraction.')
      setStep('error')
    }
  }

  function extractFromPhoto(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    runExtract({ method: 'POST', body: formData })
  }

  function extractFromUrl() {
    if (!urlInput.trim()) return
    runExtract({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlInput.trim() }),
    })
  }

  async function handleSave(data: ReviewedRecipe) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/recipes/create-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          author: data.author,
          source_book: data.source_book,
          source_url: data.source_url,
          type: data.type,
          default_servings: data.servings,
          prep_time_minutes: data.prep_minutes,
          cook_time_minutes: data.cook_minutes,
          rating: data.rating,
          notes: data.notes,
          ingredients: data.ingredients,
          steps: data.steps,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        setError(result.error ?? 'Erreur lors de la sauvegarde.')
        setSaving(false)
        return
      }
      router.push(`/recettes/${result.recipe_id}`)
      router.refresh()
    } catch {
      setError('Erreur réseau pendant la sauvegarde.')
      setSaving(false)
    }
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
              onClick={() => { setError(null); setStep('input') }}
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
  return extracted ? (
    <RecipeExtractPreview
      initial={extracted}
      context="create"
      saving={saving}
      error={error}
      onClose={() => { setExtracted(null); setError(null); setStep('input') }}
      onSave={handleSave}
    />
  ) : null
}

export default function CreerRecettePage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>}>
      <CreerRecetteFlow />
    </Suspense>
  )
}
