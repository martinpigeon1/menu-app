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

// Append a single ingredient (sort_order = current max + 1).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipeId } = await params

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

  const { data: recipe } = await admin
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .eq('household_id', member.household_id)
    .single()
  if (!recipe) return NextResponse.json({ error: 'Recette introuvable' }, { status: 404 })

  const body = await request.json()
  const { name, quantity, unit } = body as { name?: string; quantity?: number | null; unit?: string | null }
  if (!name?.trim()) return NextResponse.json({ error: 'Nom requis' }, { status: 400 })

  // Next sort_order = max existing + 1.
  const { data: last } = await admin
    .from('ingredients')
    .select('sort_order')
    .eq('recipe_id', recipeId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = (last?.sort_order ?? -1) + 1

  const { data, error } = await admin
    .from('ingredients')
    .insert({
      recipe_id: recipeId,
      name: name.trim(),
      quantity: quantity ?? null,
      unit: unit ?? null,
      sort_order: nextSort,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ingredient: data })
}
