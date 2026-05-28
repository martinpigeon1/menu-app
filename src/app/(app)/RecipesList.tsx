'use client'

// Composant client pour la liste filtrée/triée des recettes
import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Recipe, RecipeType, RecipeSource } from '@/types/database'
import RecipeCard from '@/components/ui/RecipeCard'

const RECIPE_TYPES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']
const RECIPE_SOURCES: RecipeSource[] = ['livre', 'site', 'autre']

const sourceLabels: Record<RecipeSource, string> = {
  livre: 'Livre',
  site: 'Site web',
  autre: 'Autre',
}

type SortKey = 'name' | 'rating' | 'date'

type ImportStep = 'idle' | 'loading' | 'preview' | 'importing' | 'done'

interface PreviewRow {
  name: string
  type: string
  source_book: string | null
  source_url: string | null
  rating: number | null
  prep_time_minutes: number | null
}

interface RecipesListProps {
  recipes: Recipe[]
}

export default function RecipesList({ recipes }: RecipesListProps) {
  // householdId is resolved server-side in the import API route via the user's session
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<RecipeType | ''>('')
  const [filterSource, setFilterSource] = useState<RecipeSource | ''>('')
  const [minRating, setMinRating] = useState(0)
  const [sortBy, setSortBy] = useState<SortKey>('name')

  // Import state
  const [importStep, setImportStep] = useState<ImportStep>('idle')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewTotal, setPreviewTotal] = useState(0)
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filtrage et tri en mémoire
  const filtered = recipes
    .filter((r) => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => filterType === '' || r.type === filterType)
    .filter((r) => filterSource === '' || r.source === filterSource)
    .filter((r) => minRating === 0 || (r.rating !== null && r.rating >= minRating))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'fr')
      if (sortBy === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      if (sortBy === 'date') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return 0
    })

  // Étape 1 : sélection du fichier → aperçu
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    setImportStep('loading')
    setImportMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/recipes/import?preview=true', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setImportMessage({ type: 'error', text: data.error ?? 'Erreur lors de la lecture du fichier' })
        setImportStep('idle')
        return
      }

      setPreviewRows(data.preview)
      setPreviewTotal(data.total)
      setImportStep('preview')
    } catch {
      setImportMessage({ type: 'error', text: 'Erreur réseau lors de la lecture du fichier.' })
      setImportStep('idle')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Étape 2 : confirmation → import effectif
  const handleConfirmImport = async () => {
    if (!importFile) return

    setImportStep('importing')

    const formData = new FormData()
    formData.append('file', importFile)

    try {
      const res = await fetch('/api/recipes/import', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setImportMessage({ type: 'error', text: data.error ?? 'Import échoué' })
      } else {
        const msg = `${data.imported} recette(s) importée(s) avec succès.`
        const errMsg = data.errors?.length > 0 ? ` ${data.errors.length} avertissement(s).` : ''
        setImportMessage({ type: 'success', text: msg + errMsg })
        router.refresh()
      }
    } catch {
      setImportMessage({ type: 'error', text: 'Erreur réseau lors de l\'import.' })
    } finally {
      setImportStep('done')
      setImportFile(null)
    }
  }

  const resetImport = () => {
    setImportStep('idle')
    setImportFile(null)
    setPreviewRows([])
    setImportMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800">
          Mes recettes
          {recipes.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">({recipes.length})</span>
          )}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => { resetImport(); fileInputRef.current?.click() }}
            disabled={importStep === 'loading' || importStep === 'importing'}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {importStep === 'loading' ? 'Lecture...' : importStep === 'importing' ? 'Import...' : 'Importer TSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tsv,.txt,.csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Link
            href="/recettes/nouvelle"
            className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            + Ajouter
          </Link>
        </div>
      </div>

      {/* Aperçu avant import */}
      {importStep === 'preview' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800">
              Aperçu — {previewTotal} recette(s) détectée(s)
            </p>
            <p className="text-xs text-gray-500 mt-0.5">3 premières lignes :</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="pb-1 pr-3 font-medium">Nom</th>
                  <th className="pb-1 pr-3 font-medium">Type</th>
                  <th className="pb-1 pr-3 font-medium">Source</th>
                  <th className="pb-1 pr-3 font-medium">Note</th>
                  <th className="pb-1 font-medium">Temps</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1 pr-3 font-medium text-gray-800 max-w-[140px] truncate">{row.name}</td>
                    <td className="py-1 pr-3 text-gray-600">{row.type}</td>
                    <td className="py-1 pr-3 text-gray-600 max-w-[100px] truncate">
                      {row.source_book ?? row.source_url ?? '—'}
                    </td>
                    <td className="py-1 pr-3 text-gray-600">{row.rating != null ? `${row.rating}/5` : '—'}</td>
                    <td className="py-1 text-gray-600">{row.prep_time_minutes != null ? `${row.prep_time_minutes} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleConfirmImport}
              className="flex-1 bg-green-600 text-white text-sm py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Importer {previewTotal} recette{previewTotal > 1 ? 's' : ''}
            </button>
            <button
              onClick={resetImport}
              className="px-4 text-sm py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Message résultat */}
      {importMessage && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          importMessage.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {importMessage.text}
          <button onClick={() => setImportMessage(null)} className="ml-2 underline">Fermer</button>
        </div>
      )}

      {/* Recherche */}
      <input
        type="search"
        placeholder="Rechercher une recette..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
      />

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as RecipeType | '')}
          className="flex-1 min-w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tous les types</option>
          {RECIPE_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value as RecipeSource | '')}
          className="flex-1 min-w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Toutes sources</option>
          {RECIPE_SOURCES.map((source) => (
            <option key={source} value={source}>{sourceLabels[source]}</option>
          ))}
        </select>

        <select
          value={minRating}
          onChange={(e) => setMinRating(Number(e.target.value))}
          className="flex-1 min-w-[110px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value={0}>Toutes notes</option>
          {[1, 2, 3, 4, 5].map((r) => (
            <option key={r} value={r}>{'★'.repeat(r)} min</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="flex-1 min-w-[110px] px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="name">Nom A→Z</option>
          <option value="rating">Meilleure note</option>
          <option value="date">Plus récent</option>
        </select>
      </div>

      {/* Liste */}
      {recipes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">🍽️</div>
          <p className="font-medium">Aucune recette pour l&apos;instant</p>
          <p className="text-sm mt-1">Ajoute ta première recette ou importe un fichier TSV.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p>Aucune recette ne correspond aux filtres.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  )
}
