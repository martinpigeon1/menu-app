import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import {
  resolveHousehold,
  createPicnicClient,
  picnicImageUrl,
  centsToEuros,
  normalizeIngredientName,
  mapWithConcurrency,
  PicnicSellingUnit,
  PicnicClientInstance,
} from '@/lib/picnic'
import {
  ShoppingItem,
  PicnicReviewItem,
  PicnicAutoItem,
  PicnicProduct,
  MatchConfidence,
  PicnicIngredientMapping,
} from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface ClaudePick {
  product_id: string
  product_name: string
  quantity_to_add: number
  confidence: MatchConfidence
}

function normConfidence(c: unknown): MatchConfidence {
  return c === 'high' || c === 'low' ? c : 'medium'
}

function normQuantity(q: unknown): number {
  const n = typeof q === 'number' ? Math.round(q) : parseInt(String(q), 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

async function pickWithClaude(
  anthropic: Anthropic,
  ingredient: ShoppingItem,
  results: PicnicSellingUnit[]
): Promise<ClaudePick | null> {
  const candidates = results.map((r) => ({
    product_id: r.id,
    name: r.name,
    unit_quantity: r.unit_quantity,
    price_eur: centsToEuros(r.display_price),
  }))

  const qtyText = [ingredient.quantity, ingredient.unit].filter(Boolean).join(' ') || 'quantité non précisée'

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 256,
      system: `Tu choisis le meilleur produit Picnic correspondant à un ingrédient de recette.
Réponds UNIQUEMENT en JSON, sans markdown :
{ "product_id": string, "product_name": string, "quantity_to_add": number, "confidence": "high"|"medium"|"low" }
- product_id DOIT être l'un des id fournis.
- quantity_to_add : nombre d'unités du produit à ajouter au panier compte tenu de la quantité nécessaire (minimum 1).
- confidence : "high" si le produit correspond clairement, "medium" si approximatif, "low" si incertain.`,
      messages: [
        {
          role: 'user',
          content: `Ingrédient : "${ingredient.name}" (${qtyText}).
Résultats de recherche Picnic :
${JSON.stringify(candidates)}`,
        },
      ],
    })
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return {
      product_id: String(parsed.product_id),
      product_name: String(parsed.product_name ?? ''),
      quantity_to_add: normQuantity(parsed.quantity_to_add),
      confidence: normConfidence(parsed.confidence),
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  let body: { ingredients?: ShoppingItem[]; period?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const rawIngredients = (body.ingredients ?? []).filter((i) => i?.name?.trim())
  if (rawIngredients.length === 0) {
    return NextResponse.json({ to_review: [], auto_added: [], not_found: [] })
  }

  // Dedupe by normalized name (keep first occurrence)
  const seen = new Set<string>()
  const ingredients: { item: ShoppingItem; norm: string }[] = []
  for (const item of rawIngredients) {
    const norm = normalizeIngredientName(item.name)
    if (seen.has(norm)) continue
    seen.add(norm)
    ingredients.push({ item, norm })
  }

  // Picnic credentials
  const { data: cred } = await ctx.admin
    .from('picnic_credentials')
    .select('auth_key')
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!cred) return NextResponse.json({ error: 'Picnic non connecté' }, { status: 403 })

  // Existing mappings for these ingredients
  const norms = ingredients.map((i) => i.norm)
  const { data: mappingRows } = await ctx.admin
    .from('picnic_ingredient_mappings')
    .select('*')
    .eq('household_id', ctx.householdId)
    .in('ingredient_name', norms)

  const mappings = new Map<string, PicnicIngredientMapping>()
  for (const m of (mappingRows ?? []) as PicnicIngredientMapping[]) {
    mappings.set(m.ingredient_name, m)
  }

  const client: PicnicClientInstance = createPicnicClient(cred.auth_key)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const auto_added: PicnicAutoItem[] = []
  const to_review: PicnicReviewItem[] = []
  const not_found: { ingredient: ShoppingItem }[] = []

  // Items needing a Picnic search (no existing mapping)
  const toSearch: { item: ShoppingItem; norm: string }[] = []

  for (const { item, norm } of ingredients) {
    const mapping = mappings.get(norm)
    if (mapping) {
      const product: PicnicProduct = {
        product_id: mapping.picnic_product_id,
        product_name: mapping.picnic_product_name,
        image_url: mapping.picnic_product_image_url,
        price: null,
        unit_quantity: null,
      }
      if (mapping.remembered) {
        auto_added.push({ ingredient: item, product, quantity_to_add: 1, remembered: true })
      } else {
        // Pre-filled from a previous (non-remembered) choice — still reviewed
        to_review.push({
          ingredient: item,
          suggested_product: product,
          quantity_to_add: 1,
          confidence: 'high',
          has_previous_mapping: true,
        })
      }
    } else {
      toSearch.push({ item, norm })
    }
  }

  // Search + Claude match for unmapped ingredients (limited concurrency)
  const searched = await mapWithConcurrency(toSearch, 4, async ({ item }) => {
    let results: PicnicSellingUnit[] = []
    try {
      results = (await client.catalog.search(item.name)) as unknown as PicnicSellingUnit[]
    } catch {
      results = []
    }
    if (!results || results.length === 0) {
      return { item, review: null as PicnicReviewItem | null }
    }

    const top = results.slice(0, 5)
    const pick = await pickWithClaude(anthropic, item, top)

    // Resolve the chosen selling unit (fall back to first result)
    const chosen = (pick && top.find((r) => r.id === pick.product_id)) || top[0]
    const confidence: MatchConfidence = pick
      ? (chosen.id === pick.product_id ? pick.confidence : 'low')
      : 'low'

    const product: PicnicProduct = {
      product_id: chosen.id,
      product_name: chosen.name,
      image_url: picnicImageUrl(chosen.image_id),
      price: centsToEuros(chosen.display_price),
      unit_quantity: chosen.unit_quantity ?? null,
    }

    const review: PicnicReviewItem = {
      ingredient: item,
      suggested_product: product,
      quantity_to_add: pick ? pick.quantity_to_add : 1,
      confidence,
      has_previous_mapping: false,
    }
    return { item, review }
  })

  for (const r of searched) {
    if (r.review) to_review.push(r.review)
    else not_found.push({ ingredient: r.item })
  }

  return NextResponse.json({ to_review, auto_added, not_found })
}
