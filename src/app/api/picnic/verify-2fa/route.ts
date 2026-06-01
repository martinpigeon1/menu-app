import { NextRequest, NextResponse } from 'next/server'
import { resolveHousehold, createPicnicClient } from '@/lib/picnic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  let body: { email?: string; password?: string; code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const email = body.email?.trim()
  const password = body.password
  const code = body.code?.trim()
  if (!email || !password || !code) {
    return NextResponse.json({ error: 'Email, mot de passe et code requis' }, { status: 400 })
  }

  const client = createPicnicClient()

  let authKey: string
  try {
    // Re-establish the (provisional) session, then verify the SMS code. The
    // password is never stored — only the resulting auth key is persisted.
    await client.auth.login(email, password)
    const result = await client.auth.verify2FACode(code)
    authKey = result.authKey
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // Picnic returns a generic failure for a bad/expired code.
    const friendly = /verif|2fa|code|invalid|incorrect/i.test(msg)
      ? 'Code incorrect, réessayez'
      : `Vérification échouée : ${msg || 'erreur inconnue'}`
    return NextResponse.json({ error: friendly }, { status: 401 })
  }

  // Upsert credentials (auth_key never returned to the client)
  const { error: dbError } = await ctx.admin
    .from('picnic_credentials')
    .upsert(
      {
        household_id: ctx.householdId,
        email,
        auth_key: authKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' }
    )

  if (dbError) {
    return NextResponse.json({ error: `Erreur de sauvegarde : ${dbError.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
