'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Recipe, RecipeType, RecipeSource, Ingredient, RecipeStep } from '@/types/database'
import Badge from '@/components/ui/Badge'
import StarRating from '@/components/ui/StarRating'
import IngredientImportModal, { ImportResult } from '@/components/ui/IngredientImportModal'
import StepsUrlImportModal, { StepsImportResult } from '@/components/ui/StepsUrlImportModal'
import StepText from '@/components/ui/StepText'
import AddToPlannerSheet from '@/components/ui/AddToPlannerSheet'

const TYPES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']

export default function RecipeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [steps, setSteps] = useState<RecipeStep[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showStepsUrlModal, setShowStepsUrlModal] = useState(false)
  const [showPlannerSheet, setShowPlannerSheet] = useState(false)
  const [plannerToast, setPlannerToast] = useState(false)
  const [instructionsServings, setInstructionsServings] = useState(4)

  // Edit fields
  const [editName, setEditName] = useState('')
  const [editAuthor, setEditAuthor] = useState('')
  const [editType, setEditType] = useState<RecipeType>('Plat')
  const [editSource, setEditSource] = useState<RecipeSource | ''>('')
  const [editSourceBook, setEditSourceBook] = useState('')
  const [editSourceUrl, setEditSourceUrl] = useState('')
  const [editSourcePage, setEditSourcePage] = useState('')
  const [editRating, setEditRating] = useState<number | null>(null)
  const [editPrepTime, setEditPrepTime] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    fetchRecipe()
  }, [id])

  async function fetchRecipe() {
    const supabase = createClient()
    const [{ data, error }, { data: ings }, { data: stepRows }] = await Promise.all([
      supabase.from('recipes').select('*').eq('id', id).single(),
      supabase.from('ingredients').select('*').eq('recipe_id', id).order('sort_order'),
      supabase.from('recipe_steps').select('*').eq('recipe_id', id).order('step_number'),
    ])

    if (error || !data) {
      setError('Recette introuvable.')
    } else {
      setRecipe(data)
      setIngredients(ings ?? [])
      setSteps(stepRows ?? [])
      setInstructionsServings(data.default_servings)
      populateEditFields(data)
    }
    setLoading(false)
  }

  function populateEditFields(r: Recipe) {
    setEditName(r.name)
    setEditAuthor(r.author ?? '')
    setEditType(r.type)
    setEditSource(r.source ?? '')
    setEditSourceBook(r.source_book ?? '')
    setEditSourceUrl(r.source_url ?? '')
    setEditSourcePage(r.source_page?.toString() ?? '')
    setEditRating(r.rating)
    setEditPrepTime(r.prep_time_minutes?.toString() ?? '')
    setEditNotes(r.notes ?? '')
  }

  async function handleRatingChange(newRating: number) {
    if (!recipe) return
    const supabase = createClient()
    await supabase.from('recipes').update({ rating: newRating }).eq('id', recipe.id)
    setRecipe({ ...recipe, rating: newRating })
  }

  async function handleSave() {
    if (!recipe || !editName.trim()) return
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('recipes')
      .update({
        name: editName.trim(),
        author: editAuthor.trim() || null,
        type: editType,
        source: editSource || null,
        source_book: editSourceBook.trim() || null,
        source_url: editSourceUrl.trim() || null,
        source_page: editSourcePage ? parseInt(editSourcePage) : null,
        rating: editRating,
        prep_time_minutes: editPrepTime ? parseInt(editPrepTime) : null,
        notes: editNotes.trim() || null,
      })
      .eq('id', recipe.id)

    if (updateError) {
      setError('Erreur lors de la sauvegarde : ' + updateError.message)
    } else {
      await fetchRecipe()
      setEditing(false)
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!recipe) return
    if (!confirm(`Supprimer "${recipe.name}" ?`)) return

    const supabase = createClient()
    await supabase.from('recipes').delete().eq('id', recipe.id)
    router.push('/')
    router.refresh()
  }

  function handleImportSaved(result: ImportResult) {
    setShowImportModal(false)
    if (recipe) {
      setRecipe({
        ...recipe,
        default_servings: result.servings,
        cook_time_minutes: result.cook_minutes ?? recipe.cook_time_minutes,
        notes: result.notes ?? recipe.notes,
      })
    }
    setInstructionsServings(result.servings)
    setIngredients(
      result.ingredients.map((ing, i) => ({
        id: `temp-${i}`,
        recipe_id: id,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        sort_order: i,
        created_at: new Date().toISOString(),
      }))
    )
    if (result.steps.length > 0) {
      setSteps(
        result.steps.map((step, i) => ({
          id: `temp-step-${i}`,
          recipe_id: id,
          step_number: step.step_number ?? i + 1,
          text: step.text,
          created_at: new Date().toISOString(),
        }))
      )
    }
  }

  function handleStepsUrlSaved(result: StepsImportResult) {
    setShowStepsUrlModal(false)
    if (recipe && result.cook_minutes !== null) {
      setRecipe({ ...recipe, cook_time_minutes: result.cook_minutes })
    }
    setSteps(
      result.steps.map((step, i) => ({
        id: `temp-step-${i}`,
        recipe_id: id,
        step_number: step.step_number ?? i + 1,
        text: step.text,
        created_at: new Date().toISOString(),
      }))
    )
  }

  function formatQuantity(q: number | null) {
    if (q === null) return ''
    return q % 1 === 0 ? q.toString() : q.toString()
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500 text-sm">Chargement…</div>
  }

  if (error || !recipe) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-sm mb-4">{error ?? 'Recette introuvable.'}</p>
        <Link href="/" className="text-green-600 text-sm hover:underline">← Retour</Link>
      </div>
    )
  }

  const sourceLabel: Record<string, string> = { livre: 'Livre', site: 'Site web', autre: 'Autre' }
  const isCookidoo = !!recipe.source_url?.includes('cookidoo')

  return (
    <>
      <div className="space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Retour</Link>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPlannerSheet(true)}
              title="Ajouter au planning"
              className="text-sm text-gray-600 hover:text-green-600 font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-green-50 transition-colors"
            >
              📅
            </button>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-gray-600 hover:text-gray-900 font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Modifier
              </button>
            )}
            <button
              onClick={handleDelete}
              className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition-colors"
            >
              Supprimer
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          {!editing ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{recipe.name}</h2>
                  {recipe.author && (
                    <p className="text-sm text-gray-500 mt-0.5">{recipe.author}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge type={recipe.type} />
                    {recipe.source && (
                      <span className="text-sm text-gray-500">
                        {sourceLabel[recipe.source]}
                        {recipe.source === 'livre' && recipe.source_book && ` — ${recipe.source_book}`}
                        {recipe.source === 'livre' && recipe.source_page && `, p. ${recipe.source_page}`}
                      </span>
                    )}
                    {steps.length > 0 && (
                      <span className="text-xs text-gray-500 whitespace-nowrap">📋 {steps.length} étape{steps.length !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Mode cuisine */}
              {steps.length > 0 && (
                <Link
                  href={`/recettes/${id}/cuisine`}
                  className="flex items-center justify-center gap-2 w-full bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
                >
                  👨‍🍳 Mode cuisine
                </Link>
              )}

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Note</p>
                <StarRating value={recipe.rating} onChange={handleRatingChange} size="lg" />
              </div>

              {(recipe.prep_time_minutes || recipe.cook_time_minutes) && (
                <div className="flex gap-8">
                  {recipe.prep_time_minutes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Préparation</p>
                      <p className="text-sm text-gray-700">{recipe.prep_time_minutes} min</p>
                    </div>
                  )}
                  {recipe.cook_time_minutes && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cuisson</p>
                      <p className="text-sm text-gray-700">{recipe.cook_time_minutes} min</p>
                    </div>
                  )}
                </div>
              )}

              {recipe.source === 'site' && recipe.source_url && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">URL</p>
                  <a
                    href={recipe.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-green-600 hover:underline break-all"
                  >
                    {recipe.source_url}
                  </a>
                </div>
              )}

              {recipe.notes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{recipe.notes}</p>
                </div>
              )}

              {/* Ingrédients */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingrédients</p>
                  {ingredients.length > 0 && (
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                      Ré-importer
                    </button>
                  )}
                </div>

                {ingredients.length === 0 ? (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <span>📷</span> Importer depuis photo
                    </button>
                    {recipe.source_url && !isCookidoo && (
                      <button
                        onClick={() => setShowImportModal(true)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <span>🔗</span> Récupérer depuis l&apos;URL
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Pour {recipe.default_servings} personne{recipe.default_servings > 1 ? 's' : ''}</p>
                    <ul className="space-y-1">
                      {ingredients.map((ing) => (
                        <li key={ing.id} className="text-sm text-gray-700 flex gap-2">
                          {(ing.quantity !== null || ing.unit) && (
                            <span className="text-gray-500 shrink-0">
                              {formatQuantity(ing.quantity)}{ing.unit ? ` ${ing.unit}` : ''}
                            </span>
                          )}
                          <span>{ing.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Instructions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Instructions</p>
                  {steps.length > 0 && !isCookidoo && (
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                      Ré-importer
                    </button>
                  )}
                </div>

                {isCookidoo ? (
                  <div className="space-y-2">
                    <a
                      href={recipe.source_url!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-black transition-colors"
                    >
                      🌐 Ouvrir dans Cookidoo
                    </a>
                    <p className="text-xs text-gray-400 text-center">
                      Les instructions sont disponibles directement sur Cookidoo et sur votre Thermomix
                    </p>
                  </div>
                ) : steps.length === 0 ? (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <span>📷</span> Importer depuis photo
                    </button>
                    {recipe.source_url && (
                      <button
                        onClick={() => setShowStepsUrlModal(true)}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <span>🔗</span> Extraire depuis l&apos;URL
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Serving selector */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">Pour</span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setInstructionsServings((s) => Math.max(1, s - 1))}
                          disabled={instructionsServings <= 1}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-semibold text-gray-900 text-sm">{instructionsServings}</span>
                        <button
                          onClick={() => setInstructionsServings((s) => s + 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs text-gray-500">personne{instructionsServings > 1 ? 's' : ''}</span>
                    </div>

                    <ol className="space-y-3">
                      {steps.map((step, i) => (
                        <li key={step.id} className="flex gap-3">
                          <span className="mt-0.5 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                            {i + 1}
                          </span>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            <StepText
                              text={step.text}
                              selectedServings={instructionsServings}
                              defaultServings={recipe.default_servings}
                            />
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400">
                Ajoutée le {new Date(recipe.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Modifier la recette</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Auteur</label>
                <input
                  type="text"
                  value={editAuthor}
                  onChange={(e) => setEditAuthor(e.target.value)}
                  placeholder="Cookidoo, Claire au Matcha…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as RecipeType)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Note</label>
                <StarRating value={editRating} onChange={setEditRating} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value as RecipeSource | '')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">— Aucune —</option>
                  <option value="livre">Livre</option>
                  <option value="site">Site web</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              {editSource === 'livre' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Livre</label>
                    <input type="text" value={editSourceBook} onChange={(e) => setEditSourceBook(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Page</label>
                    <input type="number" value={editSourcePage} onChange={(e) => setEditSourcePage(e.target.value)} min={1}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
              )}

              {editSource === 'site' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
                  <input type="url" value={editSourceUrl} onChange={(e) => setEditSourceUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temps (min)</label>
                <input type="number" value={editPrepTime} onChange={(e) => setEditPrepTime(e.target.value)} min={1}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !editName.trim()}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
                <button
                  onClick={() => { setEditing(false); populateEditFields(recipe) }}
                  className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showImportModal && (
        <IngredientImportModal
          recipeId={id}
          sourceUrl={recipe.source_url}
          existingIngredientCount={ingredients.length}
          onSaved={handleImportSaved}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showStepsUrlModal && recipe.source_url && (
        <StepsUrlImportModal
          recipeId={id}
          sourceUrl={recipe.source_url}
          onSaved={handleStepsUrlSaved}
          onClose={() => setShowStepsUrlModal(false)}
        />
      )}

      {showPlannerSheet && (
        <AddToPlannerSheet
          recipe={recipe}
          onClose={() => setShowPlannerSheet(false)}
          onAdded={() => {
            setShowPlannerSheet(false)
            setPlannerToast(true)
            setTimeout(() => setPlannerToast(false), 2500)
          }}
        />
      )}

      {plannerToast && (
        <div className="fixed bottom-24 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            ✅ Ajouté au planning
          </div>
        </div>
      )}
    </>
  )
}
