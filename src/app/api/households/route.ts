// API route pour la création de foyer.
// Pattern deux clients :
//   1. Client anon + cookies de la requête → vérification de l'authentification
//   2. Client service role → INSERT (bypass RLS, clé jamais exposée au navigateur)
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Client anon : lit le JWT depuis les cookies de la requête entrante
  const anonClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  // Vérifier l'authentification via le JWT
  const { data: { user }, error: authError } = await anonClient.auth.getUser()

  console.log('[POST /api/households] getUser result:', { user: user ? { id: user.id, email: user.email } : null, authError })

  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await request.json()
  const name = body?.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'Le nom du foyer est requis' }, { status: 400 })
  }

  // Client service role : bypass RLS pour les INSERTs
  // La clé service role n'est jamais exposée au navigateur (variable sans préfixe NEXT_PUBLIC_)
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Créer le foyer
  const { data: household, error: householdError } = await adminClient
    .from('households')
    .insert({ name })
    .select()
    .single()

  if (householdError || !household) {
    console.error('[POST /api/households] households insert error:', householdError)
    return NextResponse.json(
      { error: householdError?.message ?? 'Erreur lors de la création du foyer' },
      { status: 500 }
    )
  }

  // Ajouter l'utilisateur comme admin du foyer
  const { error: memberError } = await adminClient
    .from('household_members')
    .insert({ household_id: household.id, user_id: user.id, role: 'admin' })

  if (memberError) {
    console.error('[POST /api/households] household_members insert error:', memberError)
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({ household })
}
