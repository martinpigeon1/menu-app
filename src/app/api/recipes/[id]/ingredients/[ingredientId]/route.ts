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

// Verify the recipe belongs to the authenticated user's household.
async function authorize(request: NextRequest, recipeId: string) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }

  const admin = adminClient()
  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: NextResponse.json({ error: 'Foyer introuvable' }, { status: 403 }) }

  const { data: recipe } = await admin
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .eq('household_id', member.household_id)
    .single()
  if (!recipe) return { error: NextResponse.json({ error: 'Recette introuvable' }, { status: 404 }) }

  return { admin }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ingredientId: string }> }
) {
  const { id: recipeId, ingredientId } = await params
  const ctx = await authorize(request, recipeId)
  if ('error' in ctx) return ctx.error

  const body = await request.json()
  const { name, quantity, unit } = body as { name?: string; quantity?: number | null; unit?: string | null }

  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name
  if (quantity !== undefined) update.quantity = quantity
  if (unit !== undefined) update.unit = unit

  const { data, error } = await ctx.admin
    .from('ingredients')
    .update(update)
    .eq('id', ingredientId)
    .eq('recipe_id', recipeId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ingredient: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ingredientId: string }> }
) {
  const { id: recipeId, ingredientId } = await params
  const ctx = await authorize(request, recipeId)
  if ('error' in ctx) return ctx.error

  const { error } = await ctx.admin
    .from('ingredients')
    .delete()
    .eq('id', ingredientId)
    .eq('recipe_id', recipeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
