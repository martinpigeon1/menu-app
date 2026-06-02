import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function authClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )
}

interface CreateFullBody {
  name: string
  author: string | null
  source_book: string | null
  source_url: string | null
  type: string
  default_servings: number
  prep_time_minutes: number | null
  cook_time_minutes: number | null
  rating: number | null
  notes: string | null
  ingredients: { name: string; quantity: number | null; unit: string | null }[]
  steps: { step_number: number; text: string }[]
}

export async function POST(request: NextRequest) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = (await request.json()) as CreateFullBody

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Le nom est requis' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Foyer introuvable' }, { status: 403 })

  // Derive the source kind from what's provided.
  const source = body.source_url ? 'site' : body.source_book ? 'livre' : null

  // 1. Recipe first (we need its id).
  const { data: recipe, error: recipeError } = await admin
    .from('recipes')
    .insert({
      household_id: member.household_id,
      name: body.name.trim(),
      author: body.author?.trim() || null,
      type: body.type || 'Plat',
      source,
      source_book: body.source_book?.trim() || null,
      source_url: body.source_url?.trim() || null,
      rating: body.rating,
      prep_time_minutes: body.prep_time_minutes,
      cook_time_minutes: body.cook_time_minutes,
      notes: body.notes?.trim() || null,
      default_servings: body.default_servings || 4,
    })
    .select('id')
    .single()

  if (recipeError || !recipe) {
    return NextResponse.json(
      { error: 'Erreur lors de la création de la recette : ' + (recipeError?.message ?? 'inconnue') },
      { status: 500 }
    )
  }

  // 2. Ingredients.
  const ingredients = body.ingredients ?? []
  if (ingredients.length > 0) {
    const rows = ingredients.map((ing, i) => ({
      recipe_id: recipe.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      sort_order: i,
    }))
    const { error } = await admin.from('ingredients').insert(rows)
    if (error) {
      return NextResponse.json(
        { error: 'Recette créée mais erreur sur les ingrédients : ' + error.message, recipe_id: recipe.id },
        { status: 500 }
      )
    }
  }

  // 3. Steps.
  const steps = body.steps ?? []
  if (steps.length > 0) {
    const rows = steps.map((step, i) => ({
      recipe_id: recipe.id,
      step_number: step.step_number ?? i + 1,
      text: step.text,
    }))
    const { error } = await admin.from('recipe_steps').insert(rows)
    if (error) {
      return NextResponse.json(
        { error: 'Recette créée mais erreur sur les étapes : ' + error.message, recipe_id: recipe.id },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ recipe_id: recipe.id })
}
