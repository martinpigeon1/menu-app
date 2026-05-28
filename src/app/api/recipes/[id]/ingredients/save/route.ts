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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipeId } = await params

  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await request.json()
  const { default_servings, ingredients } = body as {
    default_servings: number
    ingredients: { name: string; quantity: number | null; unit: string | null }[]
  }

  if (!ingredients || !Array.isArray(ingredients)) {
    return NextResponse.json({ error: 'Ingrédients manquants' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify user owns recipe via household
  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Foyer introuvable' }, { status: 403 })

  const { data: recipe } = await admin
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .eq('household_id', member.household_id)
    .single()

  if (!recipe) return NextResponse.json({ error: 'Recette introuvable' }, { status: 404 })

  // Delete existing ingredients
  await admin.from('ingredients').delete().eq('recipe_id', recipeId)

  // Update default_servings on recipe
  await admin.from('recipes').update({ default_servings }).eq('id', recipeId)

  // Insert new ingredients with sort_order
  if (ingredients.length > 0) {
    const rows = ingredients.map((ing, i) => ({
      recipe_id: recipeId,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      sort_order: i,
    }))

    const { error } = await admin.from('ingredients').insert(rows)
    if (error) {
      return NextResponse.json({ error: 'Erreur lors de l\'enregistrement : ' + error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ saved: ingredients.length })
}
