import { NextRequest, NextResponse } from 'next/server'
import { resolveHousehold, createPicnicClient, normalizeIngredientName } from '@/lib/picnic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface CartItemInput {
  picnic_product_id: string
  quantity_to_add: number
  ingredient_name: string
  remember: boolean
  picnic_product_name?: string
  picnic_product_image_url?: string | null
  dutch_name?: string | null
}

export async function POST(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  let body: { items?: CartItemInput[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const items = (body.items ?? []).filter((i) => i?.picnic_product_id)
  if (items.length === 0) {
    return NextResponse.json({ error: 'Aucun article à ajouter' }, { status: 400 })
  }

  const { data: cred } = await ctx.admin
    .from('picnic_credentials')
    .select('auth_key')
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!cred) return NextResponse.json({ error: 'Picnic non connecté' }, { status: 403 })

  // Persist / update the ingredient -> product mappings
  const now = new Date().toISOString()
  const mappingRows = items
    .filter((i) => i.ingredient_name?.trim())
    .map((i) => ({
      household_id: ctx.householdId,
      ingredient_name: normalizeIngredientName(i.ingredient_name),
      picnic_product_id: i.picnic_product_id,
      picnic_product_name: i.picnic_product_name ?? '',
      picnic_product_image_url: i.picnic_product_image_url ?? null,
      dutch_name: i.dutch_name ?? null,
      remembered: !!i.remember,
      last_used_at: now,
    }))

  if (mappingRows.length > 0) {
    // Dedupe by ingredient_name to avoid "affect row a second time" upsert error
    const byName = new Map<string, (typeof mappingRows)[number]>()
    for (const row of mappingRows) byName.set(row.ingredient_name, row)
    await ctx.admin
      .from('picnic_ingredient_mappings')
      .upsert([...byName.values()], { onConflict: 'household_id,ingredient_name' })
  }

  // Aggregate quantities per product, then bulk add to the Picnic cart
  const qtyByProduct = new Map<string, number>()
  for (const i of items) {
    const q = Number.isFinite(i.quantity_to_add) && i.quantity_to_add >= 1 ? Math.round(i.quantity_to_add) : 1
    qtyByProduct.set(i.picnic_product_id, (qtyByProduct.get(i.picnic_product_id) ?? 0) + q)
  }
  const products = [...qtyByProduct.entries()].map(([productId, quantity]) => ({ productId, quantity }))

  const client = createPicnicClient(cred.auth_key)
  try {
    const cart = await client.cart.addProductsToCart(products)
    return NextResponse.json({ success: true, cart_item_count: cart?.total_count ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Picnic'
    return NextResponse.json({ error: `Ajout au panier échoué : ${msg}` }, { status: 502 })
  }
}
