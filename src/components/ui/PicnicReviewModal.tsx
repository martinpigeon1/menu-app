'use client'

import { useEffect, useState } from 'react'
import {
  ShoppingItem,
  PicnicProduct,
  MatchConfidence,
  PicnicMatchResult,
  PicnicAutoItem,
} from '@/types/database'

type Phase = 'matching' | 'review' | 'adding' | 'done' | 'error'

interface EditableReview {
  ingredient: ShoppingItem
  product: PicnicProduct | null
  quantity: number
  remember: boolean
  confidence: MatchConfidence
  hasPrevious: boolean
  included: boolean
  dutchName?: string | null
}

interface PicnicReviewModalProps {
  ingredients: ShoppingItem[]
  period: 'week' | 'weekend'
  onClose: () => void
}

const CONFIDENCE_BADGE: Record<MatchConfidence, { dot: string; label: string }> = {
  high: { dot: '🟢', label: 'Élevée' },
  medium: { dot: '🟡', label: 'Moyenne' },
  low: { dot: '🔴', label: 'Faible' },
}

function fmtPrice(p: number | null): string {
  if (p == null) return ''
  return `${p.toFixed(2).replace('.', ',')} €`
}

function ProductThumb({ product }: { product: PicnicProduct | null }) {
  if (!product?.image_url) {
    return <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-lg shrink-0">🛒</div>
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={product.image_url}
      alt={product.product_name}
      className="w-12 h-12 rounded-lg object-contain bg-gray-50 shrink-0"
    />
  )
}

export default function PicnicReviewModal({ ingredients, period, onClose }: PicnicReviewModalProps) {
  const [phase, setPhase] = useState<Phase>('matching')
  const [error, setError] = useState<string | null>(null)

  const [autoItems, setAutoItems] = useState<PicnicAutoItem[]>([])
  const [reviews, setReviews] = useState<EditableReview[]>([])
  const [notFound, setNotFound] = useState<ShoppingItem[]>([])

  const [autoOpen, setAutoOpen] = useState(false)
  const [cartCount, setCartCount] = useState<number | null>(null)

  // Alternatives sub-sheet
  const [altIndex, setAltIndex] = useState<number | null>(null)
  const [altQuery, setAltQuery] = useState('')
  const [altResults, setAltResults] = useState<PicnicProduct[]>([])
  const [altLoading, setAltLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/picnic/match-ingredients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredients, period }),
        })
        const data: PicnicMatchResult & { error?: string } = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error ?? 'Erreur lors de la correspondance')
          setPhase('error')
          return
        }
        setAutoItems(data.auto_added ?? [])
        setReviews(
          (data.to_review ?? []).map((r) => ({
            ingredient: r.ingredient,
            product: r.suggested_product,
            quantity: r.quantity_to_add ?? 1,
            remember: false,
            confidence: r.confidence,
            hasPrevious: r.has_previous_mapping,
            included: true,
            dutchName: r.dutch_name ?? null,
          }))
        )
        setNotFound((data.not_found ?? []).map((n) => n.ingredient))
        setPhase('review')
      } catch {
        if (!cancelled) { setError('Erreur réseau.'); setPhase('error') }
      }
    }
    run()
    return () => { cancelled = true }
  }, [ingredients, period])

  function patchReview(index: number, patch: Partial<EditableReview>) {
    setReviews((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function openAlternatives(index: number) {
    setAltIndex(index)
    const r = reviews[index]
    // Use the Dutch name for the Picnic search (it was used during matching);
    // fall back to the French name only if no translation is stored yet.
    const q = r.dutchName?.trim() || r.ingredient.name
    setAltQuery(q)
    await runAltSearch(q)
  }

  async function runAltSearch(query: string) {
    if (!query.trim()) return
    setAltLoading(true)
    try {
      const res = await fetch('/api/picnic/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      setAltResults(res.ok ? (data.products ?? []) : [])
    } catch {
      setAltResults([])
    } finally {
      setAltLoading(false)
    }
  }

  function chooseAlternative(product: PicnicProduct) {
    if (altIndex === null) return
    patchReview(altIndex, { product, confidence: 'high' })
    setAltIndex(null)
    setAltResults([])
  }

  const includedReviews = reviews.filter((r) => r.included && r.product)
  const totalToAdd = autoItems.length + includedReviews.length

  async function handleConfirm() {
    setPhase('adding')
    setError(null)
    const items = [
      ...autoItems.map((a) => ({
        picnic_product_id: a.product.product_id,
        quantity_to_add: a.quantity_to_add ?? 1,
        ingredient_name: a.ingredient.name,
        remember: true,
        picnic_product_name: a.product.product_name,
        picnic_product_image_url: a.product.image_url,
        dutch_name: a.dutch_name ?? null,
      })),
      ...includedReviews.map((r) => ({
        picnic_product_id: r.product!.product_id,
        quantity_to_add: r.quantity,
        ingredient_name: r.ingredient.name,
        remember: r.remember,
        picnic_product_name: r.product!.product_name,
        picnic_product_image_url: r.product!.image_url,
        dutch_name: r.dutchName ?? null,
      })),
    ]
    try {
      const res = await fetch('/api/picnic/add-to-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Ajout au panier échoué')
        setPhase('review')
        return
      }
      setCartCount(data.cart_item_count ?? null)
      setPhase('done')
    } catch {
      setError('Erreur réseau.')
      setPhase('review')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50">
      <div className="flex flex-col h-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-2xl sm:bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h3 className="font-semibold text-gray-900">Envoyer à Picnic</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {phase === 'matching' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-600">Recherche des produits Picnic…</p>
              <p className="text-xs text-gray-400">Claude associe chaque ingrédient à un produit.</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg">{error}</p>
              <button onClick={onClose} className="text-sm text-gray-500 underline">Fermer</button>
            </div>
          )}

          {phase === 'done' && (
            <div className="py-12 text-center space-y-4">
              <div className="text-5xl">🎉</div>
              <p className="font-semibold text-gray-900">
                {totalToAdd} article{totalToAdd > 1 ? 's' : ''} ajouté{totalToAdd > 1 ? 's' : ''} à votre panier Picnic !
              </p>
              {cartCount != null && (
                <p className="text-sm text-gray-500">Votre panier contient maintenant {cartCount} article{cartCount > 1 ? 's' : ''}.</p>
              )}
              <div className="flex flex-col gap-2 pt-2">
                <a
                  href="https://picnic.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  Ouvrir Picnic
                </a>
                <button onClick={onClose} className="w-full border border-gray-200 text-gray-600 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                  Fermer
                </button>
              </div>
            </div>
          )}

          {(phase === 'review' || phase === 'adding') && (
            <>
              {/* a. Auto-added (collapsed) */}
              {autoItems.length > 0 && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <button
                    onClick={() => setAutoOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">
                      ✅ Ajout automatique ({autoItems.length} article{autoItems.length > 1 ? 's' : ''})
                    </span>
                    <span className="text-gray-400 text-xs">{autoOpen ? '▲' : '▼'}</span>
                  </button>
                  {autoOpen && (
                    <ul className="divide-y divide-gray-50">
                      {autoItems.map((a, i) => (
                        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                          <ProductThumb product={a.product} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 truncate">{a.product.product_name}</p>
                            <p className="text-xs text-gray-400 truncate">pour {a.ingredient.name}</p>
                          </div>
                          <span className="text-xs text-gray-400">×{a.quantity_to_add ?? 1}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* b. To confirm */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-800">
                  👀 À confirmer ({includedReviews.length} article{includedReviews.length > 1 ? 's' : ''})
                </p>
                {reviews.length === 0 ? (
                  <p className="text-xs text-gray-400">Rien à confirmer.</p>
                ) : (
                  reviews.map((r, i) => {
                    const badge = CONFIDENCE_BADGE[r.confidence]
                    const lowlight = r.confidence === 'low' && r.included
                    return (
                      <div
                        key={i}
                        className={`rounded-xl border p-3 ${
                          !r.included
                            ? 'border-gray-100 bg-gray-50 opacity-60'
                            : lowlight
                            ? 'border-red-200 bg-red-50/40'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <ProductThumb product={r.product} />
                          <div className="min-w-0 flex-1">
                            {/* Ingredient line */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-gray-900">{r.ingredient.name}</span>
                              {(r.ingredient.quantity != null || r.ingredient.unit) && (
                                <span className="text-xs text-gray-400">
                                  ({r.ingredient.quantity ?? ''}{r.ingredient.unit ? ` ${r.ingredient.unit}` : ''})
                                </span>
                              )}
                              <span className="text-xs" title={`Confiance : ${badge.label}`}>{badge.dot}</span>
                              {r.hasPrevious && <span className="text-[10px] text-gray-400 border border-gray-200 rounded px-1">déjà choisi</span>}
                            </div>
                            {/* Suggested product */}
                            <p className="text-sm text-gray-600 mt-0.5 truncate">
                              → {r.product?.product_name ?? '—'}
                              {r.product?.unit_quantity ? <span className="text-gray-400"> · {r.product.unit_quantity}</span> : null}
                              {r.product?.price != null ? <span className="text-gray-400"> · {fmtPrice(r.product.price)}</span> : null}
                            </p>

                            {/* Controls */}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              {/* Quantity stepper */}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => patchReview(i, { quantity: Math.max(1, r.quantity - 1) })}
                                  className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 text-sm flex items-center justify-center hover:bg-gray-50"
                                >−</button>
                                <span className="w-6 text-center text-sm font-medium">{r.quantity}</span>
                                <button
                                  onClick={() => patchReview(i, { quantity: r.quantity + 1 })}
                                  className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 text-sm flex items-center justify-center hover:bg-gray-50"
                                >+</button>
                              </div>

                              {/* Search alternatives */}
                              <button
                                onClick={() => openAlternatives(i)}
                                className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                                title="Chercher un autre produit"
                              >🔄</button>

                              {/* Remember toggle */}
                              <button
                                onClick={() => patchReview(i, { remember: !r.remember })}
                                className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                                  r.remember
                                    ? 'bg-green-600 text-white border-green-600'
                                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                }`}
                                title="Mémoriser ce choix pour la prochaine fois"
                              >🔒 Mémoriser</button>

                              {/* Include / exclude */}
                              <button
                                onClick={() => patchReview(i, { included: !r.included })}
                                className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 ml-auto"
                              >{r.included ? 'Retirer' : 'Ajouter'}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* c. Not found */}
              {notFound.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-800 mb-1">
                    ⚠️ Non trouvés ({notFound.length})
                  </p>
                  <p className="text-xs text-amber-700">
                    {notFound.map((n) => n.name).join(', ')}
                  </p>
                  <p className="text-xs text-amber-600 mt-1">À ajouter manuellement dans l&apos;app Picnic si besoin.</p>
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </>
          )}
        </div>

        {/* Footer */}
        {(phase === 'review' || phase === 'adding') && (
          <div className="p-4 border-t border-gray-100 shrink-0">
            <button
              onClick={handleConfirm}
              disabled={phase === 'adding' || totalToAdd === 0}
              className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {phase === 'adding'
                ? 'Ajout en cours…'
                : `Ajouter ${totalToAdd} article${totalToAdd > 1 ? 's' : ''} au panier Picnic`}
            </button>
          </div>
        )}
      </div>

      {/* Alternatives sub-sheet */}
      {altIndex !== null && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white sm:items-center sm:justify-center sm:bg-black/50">
          <div className="flex flex-col h-full sm:h-auto sm:max-h-[80vh] sm:w-full sm:max-w-md sm:rounded-2xl sm:bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-gray-900">Choisir un produit</h3>
              <button onClick={() => { setAltIndex(null); setAltResults([]) }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <div className="p-4 shrink-0 flex gap-2">
              <input
                value={altQuery}
                onChange={(e) => setAltQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runAltSearch(altQuery) }}
                placeholder="Rechercher sur Picnic…"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={() => runAltSearch(altQuery)}
                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >Chercher</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {altLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : altResults.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">Aucun résultat.</p>
              ) : (
                <ul className="space-y-2">
                  {altResults.map((p) => (
                    <li key={p.product_id}>
                      <button
                        onClick={() => chooseAlternative(p)}
                        className="w-full flex items-center gap-3 p-2 rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors text-left"
                      >
                        <ProductThumb product={p} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-800 truncate">{p.product_name}</p>
                          <p className="text-xs text-gray-400">
                            {p.unit_quantity ?? ''}{p.price != null ? ` · ${fmtPrice(p.price)}` : ''}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
