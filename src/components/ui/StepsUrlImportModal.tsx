'use client'

import { useEffect, useState } from 'react'
import { ExtractedStep } from './IngredientImportModal'

export interface StepsImportResult {
  steps: ExtractedStep[]
  cook_minutes: number | null
  notes: string | null
}

interface StepsUrlImportModalProps {
  recipeId: string
  sourceUrl: string
  onSaved: (result: StepsImportResult) => void
  onClose: () => void
}

type Mode = 'loading' | 'preview' | 'saving' | 'error'

export default function StepsUrlImportModal({
  recipeId,
  sourceUrl,
  onSaved,
  onClose,
}: StepsUrlImportModalProps) {
  const [mode, setMode] = useState<Mode>('loading')
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<ExtractedStep[]>([])
  const [cookMinutes, setCookMinutes] = useState<number | null>(null)
  const [notes, setNotes] = useState<string | null>(null)

  useEffect(() => {
    extract()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function extract() {
    setMode('loading')
    setError(null)
    try {
      const res = await fetch(`/api/recipes/${recipeId}/steps/extract-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de l\'extraction')
        setMode('error')
        return
      }
      setSteps(data.steps ?? [])
      setCookMinutes(data.cook_minutes ?? null)
      setNotes(data.notes ?? null)
      setMode('preview')
    } catch {
      setError('Erreur réseau.')
      setMode('error')
    }
  }

  async function handleSave() {
    setMode('saving')
    try {
      const res = await fetch(`/api/recipes/${recipeId}/steps/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, cook_time_minutes: cookMinutes, notes }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur lors de la sauvegarde')
        setMode('preview')
        return
      }
      onSaved({ steps, cook_minutes: cookMinutes, notes })
    } catch {
      setError('Erreur réseau.')
      setMode('preview')
    }
  }

  function updateStep(i: number, value: string) {
    setSteps((prev) => {
      const updated = [...prev]
      updated[i] = { ...updated[i], text: value }
      return updated
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50">
      <div className="flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-2xl sm:bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Extraire les étapes depuis l&apos;URL</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {(mode === 'loading' || mode === 'saving') && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600">
                {mode === 'loading' ? 'Claude analyse la page…' : 'Enregistrement…'}
              </p>
            </div>
          )}

          {mode === 'error' && (
            <div className="space-y-4">
              <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                {error}
              </div>
              <button
                onClick={extract}
                className="text-sm text-green-600 hover:text-green-700 font-medium"
              >
                Réessayer
              </button>
            </div>
          )}

          {mode === 'preview' && (
            <div className="space-y-3">
              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                  {error}
                </div>
              )}
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Étapes ({steps.length}) — modifiables
              </p>
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
                </div>
              ))}
              <p className="text-[11px] text-gray-400">
                Les quantités entre [[ ]] s&apos;adaptent aux portions à l&apos;affichage.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'preview' && (
          <div className="flex gap-3 p-4 border-t border-gray-100 flex-shrink-0">
            <button
              onClick={handleSave}
              disabled={steps.length === 0}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              Sauvegarder {steps.length} étape{steps.length !== 1 ? 's' : ''}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
