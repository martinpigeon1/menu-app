import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getMondayOf, toDateString } from '@/lib/weeks'

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

// Current week's Monday, anchored to Amsterdam (see lib/weeks).
function currentMonday(): string {
  return toDateString(getMondayOf())
}

export async function GET(request: NextRequest) {
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

  const weekStart = request.nextUrl.searchParams.get('week') ?? currentMonday()

  // Find or create the meal plan
  let plan: { id: string; household_id: string; week_start: string; created_at: string } | null = null

  const { data: found } = await admin
    .from('meal_plans')
    .select('*')
    .eq('household_id', member.household_id)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (found) {
    plan = found
  } else {
    const { data: created, error: createErr } = await admin
      .from('meal_plans')
      .insert({ household_id: member.household_id, week_start: weekStart })
      .select()
      .single()
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
    plan = created
  }

  // Fetch recipes with ingredients
  const { data: mprs, error: mprErr } = await admin
    .from('meal_plan_recipes')
    .select(`
      *,
      recipe:recipe_id(
        *,
        ingredients(*)
      )
    `)
    .eq('meal_plan_id', plan!.id)
    .order('sort_order')

  if (mprErr) return NextResponse.json({ error: mprErr.message }, { status: 500 })

  return NextResponse.json({ ...plan, meal_plan_recipes: mprs ?? [] })
}
