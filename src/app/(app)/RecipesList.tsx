'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Recipe, RecipeType } from '@/types/database'
import Badge from '@/components/ui/Badge'
import BatchIngredientImport from '@/components/ui/BatchIngredientImport'
import AddToPlannerSheet from '@/components/ui/AddToPlannerSheet'

const RECIPE_TYPES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']

type SortKey = 'name' | 'rating' | 'author' | 'prep_time'
type SortDir = 'asc' | 'desc'

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
  authors: string[]
  ingredientCounts: Record<string, number>
}

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  author: 'asc',
  rating: 'desc',
  prep_time: 'asc',
}

export default function RecipesList({ recipes, authors, ingredientCounts }: RecipesListProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<RecipeType | ''>('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [minRating, setMinRating] = useState(0)
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [showBatchImport, setShowBatchImport] = useState(false)
  const [plannerRecipe, setPlannerRecipe] = useState<Recipe | null>(null)
  const [plannerToast, setPlannerToast] = useState(false)

  const [importStep, setImportStep] = useState<ImportStep>('idle')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [previewTotal, setPreviewTotal] = useState(0)
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const filtered = recipes
    .filter((r) => search === '' || r.name.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => filterType === '' || r.type === filterType)
    .filter((r) => filterAuthor === '' || r.author === filterAuthor)
    .filter((r) => minRating === 0 || (r.rating !== null && r.rating >= minRating))
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name, 'fr')
      } else if (sortBy === 'author') {
        cmp = (a.author ?? '').localeCompare(b.author ?? '', 'fr')
      } else if (sortBy === 'rating') {
        if (a.rating === null && b.rating === null) cmp = 0
        else if (a.rating === null) cmp = 1
        else if (b.rating === null) cmp = -1
        else cmp = a.rating - b.rating
      } else if (sortBy === 'prep_time') {
        if (a.prep_time_minutes === null && b.prep_time_minutes === null) cmp = 0
        else if (a.prep_time_minutes === null) cmp = 1
        else if (b.prep_time_minutes === null) cmp = -1
        else cmp = a.prep_time_minutes - b.prep_time_minutes
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

  const isFiltered = search !== '' || filterType !== '' || filterAuthor !== '' || minRating !== 0

  function handleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortDir(DEFAULT_DIR[key])
    }
  }

  function SortArrow({ k }: { k: SortKey }) {
    if (sortBy !== k) return <span className="text-gray-300 ml-0.5 text-[10px]">↕</span>
    return <span className="ml-0.5 text-green-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

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
      setImportMessage({ type: 'error', text: "Erreur réseau lors de l'import." })
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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800">Mes recettes</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBatchImport((v) => !v)}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
            title="Importer les ingrédients automatiquement depuis les URLs"
          >
            🔄 Auto
          </button>
          <button
            onClick={() => { resetImport(); fileInputRef.current?.click() }}
            disabled={importStep === 'loading' || importStep === 'importing'}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {importStep === 'loading' ? 'Lecture...' : importStep === 'importing' ? 'Import...' : 'TSV'}
          </button>
          <input ref={fileInputRef} type="file" accept=".tsv,.txt,.csv" className="hidden" onChange={handleFileChange} />
          <Link href="/recettes/nouvelle" className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
            + Ajouter
          </Link>
        </div>
      </div>

      {/* Batch import */}
      {showBatchImport && (
        <BatchIngredientImport recipes={recipes} ingredientCounts={ingredientCounts} onClose={() => setShowBatchImport(false)} />
      )}

      {/* TSV preview */}
      {importStep === 'preview' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Aperçu — {previewTotal} recette(s) détectée(s)</p>
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
                    <td className="py-1 pr-3 text-gray-600 max-w-[100px] truncate">{row.source_book ?? row.source_url ?? '—'}</td>
                    <td className="py-1 pr-3 text-gray-600">{row.rating != null ? `${row.rating}/5` : '—'}</td>
                    <td className="py-1 text-gray-600">{row.prep_time_minutes != null ? `${row.prep_time_minutes} min` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleConfirmImport} className="flex-1 bg-green-600 text-white text-sm py-2 rounded-lg hover:bg-green-700 transition-colors font-medium">
              Importer {previewTotal} recette{previewTotal > 1 ? 's' : ''}
            </button>
            <button onClick={resetImport} className="px-4 text-sm py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Import message */}
      {importMessage && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${importMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {importMessage.text}
          <button onClick={() => setImportMessage(null)} className="ml-2 underline">Fermer</button>
        </div>
      )}

      {/* Compact filters */}
      <div className="flex gap-1.5 flex-wrap">
        <input
          type="search"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[140px] h-8 px-2.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as RecipeType | '')}
          className="h-8 px-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tous types</option>
          {RECIPE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select
          value={filterAuthor}
          onChange={(e) => setFilterAuthor(e.target.value)}
          className="h-8 px-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Tous auteurs</option>
          {authors.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={minRating}
          onChange={(e) => setMinRating(Number(e.target.value))}
          className="h-8 px-2 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value={0}>Toutes notes</option>
          {[1, 2, 3, 4, 5].map((r) => <option key={r} value={r}>{'★'.repeat(r)}+</option>)}
        </select>
      </div>

      {/* Row count */}
      <p className="text-xs text-gray-400">
        {isFiltered
          ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`
          : `${recipes.length} recette${recipes.length !== 1 ? 's' : ''}`}
      </p>

      {/* Table */}
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
        // overflow:clip clips rounded corners without creating a scroll container,
        // preserving position:sticky on thead relative to the page scroll.
        <div className="rounded-xl border border-gray-200" style={{ overflow: 'clip' }}>
          {/*
            table-fixed: browser uses <th> widths strictly, no content-driven reflow.
            Column widths are set on <th> and must sum to 100% at each breakpoint.
            Mobile  (Auteur hidden): 45+16+10+16+13 = 100%
            Desktop (Auteur visible): 35+18+14+10+13+10 = 100%
          */}
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-[0_1px_0_0_#e5e7eb]">
              <tr>
                {/* Nom: 45% mobile → 35% desktop */}
                <th
                  onClick={() => handleSort('name')}
                  className="w-[45%] sm:w-[35%] px-3 py-2 text-left text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-800 transition-colors"
                >
                  Nom <SortArrow k="name" />
                </th>
                {/* Auteur: hidden mobile → 18% desktop */}
                <th
                  onClick={() => handleSort('author')}
                  className="hidden sm:table-cell sm:w-[18%] px-3 py-2 text-left text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-800 transition-colors"
                >
                  Auteur <SortArrow k="author" />
                </th>
                {/* Type: 16% mobile → 14% desktop */}
                <th className="w-[16%] sm:w-[14%] px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  Type
                </th>
                {/* Note: 10% both */}
                <th
                  onClick={() => handleSort('rating')}
                  className="w-[10%] px-3 py-2 text-left text-xs font-semibold text-gray-500 cursor-pointer select-none hover:text-gray-800 transition-colors"
                >
                  Note <SortArrow k="rating" />
                </th>
                {/* Ing: 16% mobile → 13% desktop */}
                <th className="w-[16%] sm:w-[13%] px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  Ing.
                </th>
                {/* Actions: 13% mobile → 10% desktop */}
                <th className="w-[13%] sm:w-[10%] px-3 py-2 text-left text-xs font-semibold text-gray-500">
                  {/* empty — icon column */}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((recipe, i) => {
                const ingCount = ingredientCounts[recipe.id] ?? 0
                return (
                  <tr
                    key={recipe.id}
                    onClick={() => router.push(`/recettes/${recipe.id}`)}
                    className={`cursor-pointer hover:bg-green-50 transition-colors border-t border-gray-100 ${i === 0 ? 'border-t-0' : ''} ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}`}
                  >
                    {/* Nom */}
                    <td className="px-3 py-2.5 font-medium text-gray-900 overflow-hidden">
                      <span className="block truncate">{recipe.name}</span>
                    </td>

                    {/* Auteur — desktop only */}
                    <td className="hidden sm:table-cell px-3 py-2.5 text-xs text-gray-500 overflow-hidden">
                      <span className="block truncate">{recipe.author ?? '—'}</span>
                    </td>

                    {/* Type */}
                    <td className="px-3 py-2.5 overflow-hidden">
                      <Badge type={recipe.type} compact />
                    </td>

                    {/* Note */}
                    <td className="px-3 py-2.5 text-xs overflow-hidden">
                      {recipe.rating != null && recipe.rating > 0
                        ? <span className="whitespace-nowrap"><span className="text-amber-400">★</span><span className="text-gray-700 ml-0.5">{recipe.rating}</span></span>
                        : <span className="text-gray-300">—</span>
                      }
                    </td>

                    {/* Ingrédients */}
                    <td className="px-3 py-2.5 text-xs overflow-hidden">
                      {ingCount > 0
                        ? <span className="text-gray-700 whitespace-nowrap">✅ {ingCount}</span>
                        : <span className="text-amber-500">⚠️</span>
                      }
                    </td>

                    {/* Actions: 📅 only, centred, 36×36 touch target */}
                    <td className="px-1 py-1 text-center overflow-hidden">
                      <button
                        onClick={(e) => { e.stopPropagation(); setPlannerRecipe(recipe) }}
                        title="Ajouter au planning"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-300 hover:text-green-600 hover:bg-green-50 transition-colors"
                      >
                        📅
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {plannerToast && (
        <div className="fixed bottom-24 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            ✅ Ajouté au planning
          </div>
        </div>
      )}

      {/* Add to planner sheet */}
      {plannerRecipe && (
        <AddToPlannerSheet
          recipe={plannerRecipe}
          onClose={() => setPlannerRecipe(null)}
          onAdded={() => {
            setPlannerRecipe(null)
            setPlannerToast(true)
            setTimeout(() => setPlannerToast(false), 2500)
          }}
        />
      )}
    </div>
  )
}
