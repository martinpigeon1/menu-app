// API route pour la création de foyer
// Utilise createServerClient (session lue depuis les cookies de la requête)
// afin de garantir que le JWT est transmis à Supabase et que auth.uid() fonctionne.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Vérifier que l'utilisateur est bien authentifié côté serveur
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
    return NextResponse.json(
      { error: memberError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ household })
}
