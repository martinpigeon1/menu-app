'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Recipe } from '@/types/database'

interface RecipeProgress {
  id: string
  name: string
  status: 'pending' | 'running' | 'success' | 'error'
  ingredient_count?: number
  error?: string
}

type Phase = 'idle' | 'running' | 'done'

interface BatchIngredientImportProps {
  recipes: Recipe[]
  ingredientCounts: Record<string, number>
  onClose: () => void
}

export default function BatchIngredientImport({ recipes, ingredientCounts, onClose }: BatchIngredientImportProps) {
  const router = useRouter()
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [items, setItems] = useState<RecipeProgress[]>([])
  const [total, setTotal] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [errorCount, setErrorCount] = useState(0)

  // Client-side eligible count (for preview before starting)
  const eligibleCount = recipes.filter(
    (r) => r.source_url?.startsWith('http') && (ingredientCounts[r.id] ?? 0) === 0
  ).length

  function updateItem(id: string, patch: Partial<RecipeProgress>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function startImport() {
    setPhase('running')
    setItems([])
    setSuccessCount(0)
    setErrorCount(0)

    try {
      const res = await fetch('/api/recipes/batch-import-ingredients', { method: 'POST' })
      if (!res.ok || !res.body) {
        setPhase('done')
        return
      }

      const reader = res.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      let localSuccess = 0
      let localErrors = 0

      while (!done) {
        const { value, done: streamDone } = await reader.read()
        done = streamDone
        if (value) buffer += decoder.decode(value, { stream: !done })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'init') {
              setTotal(event.total)
              setItems(event.recipes.map((r: { id: string; name: string }) => ({
                id: r.id,
                name: r.name,
                status: 'pending',
              })))
            } else if (event.type === 'progress') {
              if (event.status === 'running') {
                updateItem(event.recipe_id, { status: 'running' })
              } else if (event.status === 'success') {
                updateItem(event.recipe_id, { status: 'success', ingredient_count: event.ingredient_count })
                localSuccess++
                setSuccessCount(localSuccess)
              } else if (event.status === 'error') {
                updateItem(event.recipe_id, { status: 'error', error: event.error })
                localErrors++
                setErrorCount(localErrors)
              }
            } else if (event.type === 'complete') {
              setTotal(event.total)
              setSuccessCount(event.success)
              setErrorCount(event.errors)
              setPhase('done')
              router.refresh()
            }
          } catch {}
        }
      }

      if (phase !== 'done') setPhase('done')
    } catch {
      setPhase('done')
    }
  }

  function retry() {
    startImport()
  }

  const errorIds = new Set(items.filter((i) => i.status === 'error').map((i) => i.id))
  const doneCount = items.filter((i) => i.status === 'success' || i.status === 'error').length
  const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 text-sm">Import automatique d&apos;ingrédients</h3>
        {phase !== 'running' && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        )}
      </div>

      {/* IDLE */}
      {phase === 'idle' && (
        <div className="space-y-3">
          {eligibleCount === 0 ? (
            <p className="text-sm text-gray-500">
              Aucune recette éligible — toutes les recettes avec une URL publique ont déjà des ingrédients.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-green-700">{eligibleCount} recette{eligibleCount > 1 ? 's' : ''}</span> avec URL publique sans ingrédients.
              </p>
              <p className="text-xs text-gray-400">Claude va extraire les ingrédients automatiquement depuis chaque page. Comptez ~15s par recette.</p>
              <button
                onClick={startImport}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Importer les ingrédients automatiquement
              </button>
            </>
          )}
        </div>
      )}

      {/* RUNNING / DONE — progress list */}
      {(phase === 'running' || phase === 'done') && (
        <div className="space-y-3">
          {/* Progress bar */}
          {total > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{doneCount}/{total}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Recipe list */}
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 mt-0.5">
                  {item.status === 'pending'  && <span className="text-gray-300">○</span>}
                  {item.status === 'running'  && <span className="inline-block w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />}
                  {item.status === 'success'  && <span className="text-green-600">✅</span>}
                  {item.status === 'error'    && <span className="text-red-500">❌</span>}
                </span>
                <div className="min-w-0">
                  <span className={`${item.status === 'error' ? 'text-red-700' : item.status === 'success' ? 'text-gray-800' : 'text-gray-400'} font-medium`}>
                    {item.name}
                  </span>
                  {item.status === 'success' && item.ingredient_count !== undefined && (
                    <span className="text-gray-400 text-xs ml-1">— {item.ingredient_count} ingrédient{item.ingredient_count !== 1 ? 's' : ''}</span>
                  )}
                  {item.status === 'error' && item.error && (
                    <p className="text-xs text-red-500 mt-0.5">{item.error}</p>
                  )}
                </div>
              </div>
            ))}
            {phase === 'running' && items.length === 0 && (
              <p className="text-sm text-gray-400 italic">Récupération des recettes…</p>
            )}
          </div>

          {/* Done summary */}
          {phase === 'done' && (
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-800">
                {successCount > 0 && <span className="text-green-700">{successCount} importée{successCount > 1 ? 's' : ''}</span>}
                {successCount > 0 && errorCount > 0 && <span className="text-gray-400">, </span>}
                {errorCount > 0 && <span className="text-red-600">{errorCount} erreur{errorCount > 1 ? 's' : ''}</span>}
                {successCount === 0 && errorCount === 0 && <span className="text-gray-500">Aucune recette éligible.</span>}
              </p>
              <div className="flex gap-2">
                {errorCount > 0 && (
                  <button
                    onClick={retry}
                    className="flex-1 border border-green-600 text-green-700 py-2 rounded-lg text-sm font-medium hover:bg-green-50 transition-colors"
                  >
                    ↻ Réessayer les erreurs
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
