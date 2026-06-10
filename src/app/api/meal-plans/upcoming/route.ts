import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { amsterdamToday, getMondayOf, addWeeks, toDateString, fromDateString } from '@/lib/weeks'

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

interface PlanRow {
  id: string
  week_start: string
  meal_plan_recipes: {
    id: string
    recipe_id: string
    day_of_week: number | null
    sort_order: number
    servings: number
    recipe: { name: string; author: string | null } | null
  }[]
}

interface UpcomingMeal {
  id: string
  recipe_id: string
  name: string
  author: string | null
  servings: number
  day_of_week: number
  date: string
  week_start: string
  meal_plan_id: string
  sort_order: number
}

// Upcoming planned meals across all weeks (from yesterday onward), one entry per
// recipe assigned to a day, sorted chronologically. Used by the day picker.
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

  // Previous week onward, so a meal from "yesterday" (a Sunday) is still caught.
  const prevMonday = toDateString(addWeeks(getMondayOf(), -1))
  const y = amsterdamToday()
  y.setDate(y.getDate() - 1)
  const yesterdayStr = toDateString(y)

  const { data: plans } = await admin
    .from('meal_plans')
    .select('id, week_start, meal_plan_recipes(id, recipe_id, day_of_week, sort_order, servings, recipe:recipe_id(name, author))')
    .eq('household_id', member.household_id)
    .gte('week_start', prevMonday)

  const meals: UpcomingMeal[] = []
  for (const plan of (plans ?? []) as unknown as PlanRow[]) {
    const base = fromDateString(plan.week_start)
    for (const mpr of plan.meal_plan_recipes ?? []) {
      if (mpr.day_of_week === null || !mpr.recipe) continue
      const d = new Date(base)
      d.setDate(base.getDate() + mpr.day_of_week)
      const date = toDateString(d)
      if (date >= yesterdayStr) {
        meals.push({
          id: mpr.id,
          recipe_id: mpr.recipe_id,
          name: mpr.recipe.name,
          author: mpr.recipe.author,
          servings: mpr.servings,
          day_of_week: mpr.day_of_week,
          date,
          week_start: plan.week_start,
          meal_plan_id: plan.id,
          sort_order: mpr.sort_order,
        })
      }
    }
  }

  meals.sort((a, b) => (a.date === b.date ? a.sort_order - b.sort_order : a.date.localeCompare(b.date)))

  return NextResponse.json({ meals })
}
