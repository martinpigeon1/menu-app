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

async function verifyAccess(request: NextRequest, planId: string) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = adminClient()
  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return null

  const { data: plan } = await admin
    .from('meal_plans')
    .select('id')
    .eq('id', planId)
    .eq('household_id', member.household_id)
    .single()
  if (!plan) return null

  return admin
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mealPlanRecipeId: string }> }
) {
  const { id: planId, mealPlanRecipeId } = await params
  const admin = await verifyAccess(request, planId)
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { error } = await admin
    .from('meal_plan_recipes')
    .delete()
    .eq('id', mealPlanRecipeId)
    .eq('meal_plan_id', planId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mealPlanRecipeId: string }> }
) {
  const { id: planId, mealPlanRecipeId } = await params
  const admin = await verifyAccess(request, planId)
  if (!admin) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.servings !== undefined) updates.servings = body.servings
  if (body.day_of_week !== undefined) updates.day_of_week = body.day_of_week
  if (body.meal_type !== undefined) updates.meal_type = body.meal_type

  const { data, error } = await admin
    .from('meal_plan_recipes')
    .update(updates)
    .eq('id', mealPlanRecipeId)
    .eq('meal_plan_id', planId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
