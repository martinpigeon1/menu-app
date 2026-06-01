import { NextRequest, NextResponse } from 'next/server'
import { resolveHousehold, createPicnicClient } from '@/lib/picnic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const email = body.email?.trim()
  const password = body.password
  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const client = createPicnicClient()

  let authKey: string
  try {
    const result = await client.auth.login(email, password)
    if (result.second_factor_authentication_required) {
      return NextResponse.json(
        { error: "Votre compte Picnic requiert une authentification à deux facteurs, non prise en charge pour le moment." },
        { status: 400 }
      )
    }
    authKey = result.authKey
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Échec de la connexion'
    return NextResponse.json({ error: `Connexion Picnic échouée : ${msg}` }, { status: 401 })
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
