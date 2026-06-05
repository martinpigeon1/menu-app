import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { mondayOf } from '@/lib/chef'

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

async function householdId(request: NextRequest) {
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

  return { admin, household_id: member.household_id as string }
}

export async function GET(request: NextRequest) {
  const ctx = await householdId(request)
  if ('error' in ctx) return ctx.error
  const { admin, household_id } = ctx
  const weekStart = mondayOf(0)

  const { data: found } = await admin
    .from('chef_conversations')
    .select('*')
    .eq('household_id', household_id)
    .eq('week_start', weekStart)
    .maybeSingle()

  if (found) {
    return NextResponse.json({ id: found.id, week_start: found.week_start, messages: found.messages ?? [] })
  }

  const { data: created, error } = await admin
    .from('chef_conversations')
    .insert({ household_id, week_start: weekStart, messages: [] })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: created.id, week_start: created.week_start, messages: [] })
}

export async function DELETE(request: NextRequest) {
  const ctx = await householdId(request)
  if ('error' in ctx) return ctx.error
  const { admin, household_id } = ctx
  const weekStart = mondayOf(0)

  await admin
    .from('chef_conversations')
    .update({ messages: [], updated_at: new Date().toISOString() })
    .eq('household_id', household_id)
    .eq('week_start', weekStart)

  return NextResponse.json({ ok: true })
}
