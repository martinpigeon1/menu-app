'use client'

// Formulaire d'ajout d'une nouvelle recette
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { RecipeType, RecipeSource } from '@/types/database'
import StarRating from '@/components/ui/StarRating'

const TYPES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']

export default function NouvelleRecettePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [type, setType] = useState<RecipeType>('Plat')
  const [source, setSource] = useState<RecipeSource | ''>('')
  const [sourceBook, setSourceBook] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourcePage, setSourcePage] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [prepTime, setPrepTime] = useState('')
  const [notes, setNotes] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Récupérer le household de l'utilisateur
    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      setError('Aucun foyer associé à votre compte. Contactez un administrateur.')
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase.from('recipes').insert({
      household_id: member.household_id,
      name: name.trim(),
      author: author.trim() || null,
      type,
      source: source || null,
      source_book: sourceBook.trim() || null,
      source_url: sourceUrl.trim() || null,
      source_page: sourcePage ? parseInt(sourcePage) : null,
      rating,
      prep_time_minutes: prepTime ? parseInt(prepTime) : null,
      notes: notes.trim() || null,
    })

    if (insertError) {
      setError('Erreur lors de l\'enregistrement : ' + insertError.message)
      setSaving(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600">
          ← Retour
        </Link>
        <h2 className="text-xl font-bold text-gray-900">Nouvelle recette</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-xl border border-gray-200 p-5">
        {/* Nom */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nom <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Ratatouille, Tarte aux pommes…"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Auteur */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Auteur</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Cookidoo, Claire au Matcha…"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type <span className="text-red-500">*</span>
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as RecipeType)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
          <StarRating value={rating} onChange={setRating} />
        </div>

        {/* Source */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as RecipeSource | '')}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            <option value="">— Aucune —</option>
            <option value="livre">Livre</option>
            <option value="site">Site web</option>
            <option value="autre">Autre</option>
          </select>
        </div>

        {source === 'livre' && (
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Livre</label>
              <input
                type="text"
                value={sourceBook}
                onChange={(e) => setSourceBook(e.target.value)}
                placeholder="Titre du livre"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Page</label>
              <input
                type="number"
                value={sourcePage}
                onChange={(e) => setSourcePage(e.target.value)}
                placeholder="42"
                min={1}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        )}

        {source === 'site' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        )}

        {/* Temps de préparation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Temps de préparation (min)</label>
          <input
            type="number"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            placeholder="30"
            min={1}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Remarques, variantes…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <Link
            href="/"
            className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center"
          >
            Annuler
          </Link>
        </div>
      </form>
    </div>
  )
}
