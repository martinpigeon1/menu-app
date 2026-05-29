import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function authClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  )
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const CATEGORIES = ['Fruits & Légumes', 'Poissons & Fruits de mer', 'Viandes', 'Produits laitiers', 'Épicerie sèche', 'Surgélés', 'Autre'] as const

const PERIOD_DAYS: Record<string, number[]> = {
  week:    [0, 1, 2, 3, 4], // Mon–Fri
  weekend: [5, 6],           // Sat–Sun
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = adminClient()

  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Foyer introuvable' }, { status: 403 })

  const { data: plan } = await admin
    .from('meal_plans')
    .select('id')
    .eq('id', planId)
    .eq('household_id', member.household_id)
    .single()
  if (!plan) return NextResponse.json({ error: 'Plan introuvable' }, { status: 404 })

  const period = request.nextUrl.searchParams.get('period') ?? 'week'
  const allowedDays = PERIOD_DAYS[period] ?? PERIOD_DAYS.week

  // Only include recipes assigned to the requested period's days (null excluded)
  const { data: mprs } = await admin
    .from('meal_plan_recipes')
    .select(`*, recipe:recipe_id(name, default_servings, ingredients(*))`)
    .eq('meal_plan_id', planId)
    .in('day_of_week', allowedDays)

  if (!mprs || mprs.length === 0) {
    return NextResponse.json({ categories: [], missing_recipes: [] })
  }

  // Aggregate scaled ingredients
  const map = new Map<string, { name: string; quantity: number | null; unit: string | null }>()
  const missing_recipes: string[] = []

  for (const mpr of mprs) {
    const recipe = mpr.recipe as {
      name: string
      default_servings: number
      ingredients: { name: string; quantity: number | null; unit: string | null }[]
    }
    const ingredients = recipe?.ingredients ?? []

    if (ingredients.length === 0) {
      missing_recipes.push(recipe.name)
      continue
    }

    for (const ing of ingredients) {
      const key = `${ing.name.toLowerCase().trim()}__${(ing.unit ?? '').toLowerCase()}`
      const scale = recipe.default_servings > 0 ? mpr.servings / recipe.default_servings : 1
      const scaledQty = ing.quantity != null ? ing.quantity * scale : null

      const existing = map.get(key)
      if (existing) {
        if (existing.quantity != null && scaledQty != null) {
          existing.quantity += scaledQty
        }
      } else {
        map.set(key, { name: ing.name, quantity: scaledQty, unit: ing.unit })
      }
    }
  }

  const aggregated = Array.from(map.values())

  if (aggregated.length === 0) {
    return NextResponse.json({ categories: [], missing_recipes })
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let categories: { category: string; ingredients: { name: string; quantity: number | null; unit: string | null }[] }[] = []

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: `Categorise ces ingrédients dans ces catégories exactes: ${CATEGORIES.join(', ')}.
Retourne UNIQUEMENT du JSON valide, sans markdown, sans explication:
[{ "category": string, "ingredients": [{ "name": string, "quantity": number|null, "unit": string|null }] }]
Conserve exactement les valeurs quantity et unit fournies. Regroupe les ingrédients similaires si possible.`,
      messages: [{ role: 'user', content: JSON.stringify(aggregated) }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) categories = JSON.parse(jsonMatch[0])
  } catch {
    categories = [{ category: 'Autre', ingredients: aggregated }]
  }

  return NextResponse.json({ categories, missing_recipes })
}
