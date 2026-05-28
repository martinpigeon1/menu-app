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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = adminClient()

  // Verify plan belongs to user's household
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

  const body = await request.json()
  const { recipe_id, servings = 4, day_of_week = null, meal_type = 'dinner' } = body

  // Determine sort_order (append at end)
  const { count } = await admin
    .from('meal_plan_recipes')
    .select('*', { count: 'exact', head: true })
    .eq('meal_plan_id', planId)

  const { data: mpr, error } = await admin
    .from('meal_plan_recipes')
    .insert({ meal_plan_id: planId, recipe_id, servings, day_of_week, meal_type, sort_order: count ?? 0 })
    .select(`*, recipe:recipe_id(*, ingredients(*))`)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(mpr)
}
