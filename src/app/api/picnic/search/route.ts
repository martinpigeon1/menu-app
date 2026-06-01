import { NextRequest, NextResponse } from 'next/server'
import { resolveHousehold, createPicnicClient, picnicImageUrl, centsToEuros, PicnicSellingUnit } from '@/lib/picnic'
import { PicnicProduct } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  let body: { query?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }
  const query = body.query?.trim()
  if (!query) return NextResponse.json({ error: 'Recherche vide' }, { status: 400 })

  const { data: cred } = await ctx.admin
    .from('picnic_credentials')
    .select('auth_key')
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!cred) return NextResponse.json({ error: 'Picnic non connecté' }, { status: 403 })

  const client = createPicnicClient(cred.auth_key)

  try {
    const results = (await client.catalog.search(query)) as unknown as PicnicSellingUnit[]
    const products: PicnicProduct[] = (results ?? []).slice(0, 5).map((p) => ({
      product_id: p.id,
      product_name: p.name,
      image_url: picnicImageUrl(p.image_id),
      price: centsToEuros(p.display_price),
      unit_quantity: p.unit_quantity ?? null,
    }))
    return NextResponse.json({ products })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Picnic'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
