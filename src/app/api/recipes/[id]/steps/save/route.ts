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
  const { steps, cook_time_minutes, notes } = body as {
    steps: { step_number: number; text: string }[]
    cook_time_minutes?: number | null
    notes?: string | null
  }

  if (!steps || !Array.isArray(steps)) {
    return NextResponse.json({ error: 'Étapes manquantes' }, { status: 400 })
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

  // Delete existing steps, then re-insert (no partial updates).
  await admin.from('recipe_steps').delete().eq('recipe_id', recipeId)

  if (steps.length > 0) {
    const rows = steps.map((step, i) => ({
      recipe_id: recipeId,
      step_number: step.step_number ?? i + 1,
      text: step.text,
    }))

    const { error } = await admin.from('recipe_steps').insert(rows)
    if (error) {
      return NextResponse.json({ error: 'Erreur lors de l\'enregistrement : ' + error.message }, { status: 500 })
    }
  }

  // Optionally update cooking time and notes on the recipe.
  const recipeUpdate: Record<string, unknown> = {}
  if (cook_time_minutes !== undefined) recipeUpdate.cook_time_minutes = cook_time_minutes
  if (notes !== undefined) recipeUpdate.notes = notes
  if (Object.keys(recipeUpdate).length > 0) {
    await admin.from('recipes').update(recipeUpdate).eq('id', recipeId)
  }

  return NextResponse.json({ saved: steps.length })
}
