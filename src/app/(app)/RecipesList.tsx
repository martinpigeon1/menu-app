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

interface RecipesListProps {
  recipes: Recipe[]
  householdId: string
}

export default function RecipesList({ recipes, householdId }: RecipesListProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<RecipeType | ''>('')
  const [filterSource, setFilterSource] = useState<RecipeSource | ''>('')
  const [minRating, setMinRating] = useState(0)
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

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

  // Gestion de l'import TSV
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportMessage(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('household_id', householdId)

    try {
      const response = await fetch('/api/recipes/import', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setImportMessage(`${result.imported} recette(s) importée(s) avec succès.`)
        if (result.errors?.length > 0) {
          setImportMessage(
            `${result.imported} recette(s) importée(s). ${result.errors.length} erreur(s) : ${result.errors.join(', ')}`
          )
        }
        router.refresh()
      } else {
        setImportMessage(`Erreur : ${result.error ?? 'Import échoué'}`)
      }
    } catch {
      setImportMessage('Erreur réseau lors de l\'import.')
    } finally {
      setImporting(false)
      // Réinitialiser le champ fichier
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      {/* En-tête avec boutons d'action */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800">
          Mes recettes
          {recipes.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">({recipes.length})</span>
          )}
        </h2>
        <div className="flex gap-2">
          {/* Bouton import TSV */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {importing ? 'Import...' : 'Importer TSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tsv,.txt"
            className="hidden"
            onChange={handleImport}
          />

          {/* Bouton ajouter */}
          <Link
            href="/recettes/nouvelle"
            className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            + Ajouter
          </Link>
        </div>
      </div>

      {/* Message d'import */}
      {importMessage && (
        <div className={`px-4 py-3 rounded-lg text-sm border ${
          importMessage.startsWith('Erreur')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-green-50 border-green-200 text-green-700'
        }`}>
          {importMessage}
          <button onClick={() => setImportMessage(null)} className="ml-2 underline">Fermer</button>
        </div>
      )}

      {/* Barre de recherche */}
      <input
        type="search"
        placeholder="Rechercher une recette..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
      />

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {/* Filtre par type */}
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

        {/* Filtre par source */}
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

        {/* Note minimale */}
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

        {/* Tri */}
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

      {/* Liste des recettes */}
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
