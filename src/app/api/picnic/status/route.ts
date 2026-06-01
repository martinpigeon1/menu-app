import { NextRequest, NextResponse } from 'next/server'
import { resolveHousehold } from '@/lib/picnic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  // Never select auth_key here — it must not reach the client.
  const { data } = await ctx.admin
    .from('picnic_credentials')
    .select('email')
    .eq('household_id', ctx.householdId)
    .maybeSingle()

  if (!data) return NextResponse.json({ connected: false })
  return NextResponse.json({ connected: true, email: data.email ?? undefined })
}
