// API route pour la création de foyer.
// Lit les cookies directement depuis la NextRequest (même pattern que le middleware)
// pour garantir que le JWT rafraîchi par le middleware est bien transmis à Supabase.
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Créer le client depuis les cookies de la requête entrante
  // (et non depuis next/headers, qui peut ne pas refléter les tokens rafraîchis par le middleware)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // Route Handler : pas besoin de propager les cookies rafraîchis dans la réponse
        },
      },
    }
  )

  // Vérifier l'authentification via le JWT de la requête
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const body = await request.json()
  const name = body?.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'Le nom du foyer est requis' }, { status: 400 })
  }

  // Créer le foyer
  const { data: household, error: householdError } = await supabase
    .from('households')
    .insert({ name })
    .select()
    .single()

  if (householdError || !household) {
    return NextResponse.json(
      { error: householdError?.message ?? 'Erreur lors de la création du foyer' },
      { status: 500 }
    )
  }

  // Ajouter l'utilisateur courant comme admin du foyer
  const { error: memberError } = await supabase
    .from('household_members')
    .insert({ household_id: household.id, user_id: user.id, role: 'admin' })

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 })
  }

  return NextResponse.json({ household })
}
