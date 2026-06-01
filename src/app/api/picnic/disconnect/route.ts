import { NextRequest, NextResponse } from 'next/server'
import { resolveHousehold } from '@/lib/picnic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  const { error } = await ctx.admin
    .from('picnic_credentials')
    .delete()
    .eq('household_id', ctx.householdId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
