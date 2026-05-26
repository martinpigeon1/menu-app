// API route : import de recettes depuis un fichier TSV
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { RecipeType, RecipeSource } from '@/types/database'

const TYPES_VALIDES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']
const SOURCES_VALIDES: RecipeSource[] = ['livre', 'site', 'autre']

// Mapping flexible des noms de colonnes TSV
const COL_MAP: Record<string, string> = {
  nom: 'name', name: 'name',
  type: 'type',
  source: 'source',
  url: 'source_url', source_url: 'source_url',
  livre: 'source_book', source_book: 'source_book',
  page: 'source_page', source_page: 'source_page',
  note: 'rating', rating: 'rating',
  temps: 'prep_time_minutes', prep_time_minutes: 'prep_time_minutes', 'temps (min)': 'prep_time_minutes',
  notes: 'notes', remarques: 'notes',
}

function normaliserType(val: string): RecipeType | null {
  const v = val.trim()
  const match = TYPES_VALIDES.find((t) => t.toLowerCase() === v.toLowerCase())
  return match ?? null
}

function normaliserSource(val: string): RecipeSource | null {
  const v = val.trim().toLowerCase()
  if (v === 'livre' || v === 'book') return 'livre'
  if (v === 'site' || v === 'web' || v === 'url') return 'site'
  if (v === 'autre' || v === 'other') return 'autre'
  return null
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  // Client Supabase avec les cookies de session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Récupérer le household de l'utilisateur
  const { data: member } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Aucun foyer associé' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
  }

  const text = await file.text()
  const lignes = text.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lignes.length < 2) {
    return NextResponse.json({ error: 'Fichier vide ou sans données' }, { status: 400 })
  }

  // Détecter le séparateur (tabulation ou point-virgule)
  const sep = lignes[0].includes('\t') ? '\t' : ';'
  const headers = lignes[0].split(sep).map((h) => h.trim().toLowerCase())

  // Mapper les colonnes
  const colIndex: Record<string, number> = {}
  headers.forEach((h, i) => {
    const mapped = COL_MAP[h]
    if (mapped) colIndex[mapped] = i
  })

  if (colIndex['name'] === undefined) {
    return NextResponse.json({ error: 'Colonne "Nom" ou "name" introuvable dans le fichier' }, { status: 400 })
  }

  const recettes = []
  const erreurs: string[] = []

  for (let i = 1; i < lignes.length; i++) {
    const cols = lignes[i].split(sep)
    const get = (key: string) => (colIndex[key] !== undefined ? (cols[colIndex[key]] ?? '').trim() : '')

    const name = get('name')
    if (!name) continue

    const typeRaw = get('type')
    const type: RecipeType = normaliserType(typeRaw) ?? 'Plat'
    if (typeRaw && !normaliserType(typeRaw)) {
      erreurs.push(`Ligne ${i + 1} : type "${typeRaw}" inconnu, "Plat" utilisé par défaut`)
    }

    const sourceRaw = get('source')
    const source = sourceRaw ? (normaliserSource(sourceRaw) ?? null) : null

    const ratingRaw = get('rating')
    const rating = ratingRaw ? Math.min(5, Math.max(0, parseInt(ratingRaw))) : null

    const prepRaw = get('prep_time_minutes')
    const prep_time_minutes = prepRaw ? parseInt(prepRaw) : null

    const source_page_raw = get('source_page')
    const source_page = source_page_raw ? parseInt(source_page_raw) : null

    recettes.push({
      household_id: member.household_id,
      name,
      type,
      source,
      source_url: get('source_url') || null,
      source_book: get('source_book') || null,
      source_page: isNaN(source_page as number) ? null : source_page,
      rating: isNaN(rating as number) ? null : rating,
      prep_time_minutes: isNaN(prep_time_minutes as number) ? null : prep_time_minutes,
      notes: get('notes') || null,
    })
  }

  if (recettes.length === 0) {
    return NextResponse.json({ error: 'Aucune recette valide trouvée dans le fichier', errors: erreurs }, { status: 400 })
  }

  // Insertion par lots de 50
  let imported = 0
  for (let i = 0; i < recettes.length; i += 50) {
    const lot = recettes.slice(i, i + 50)
    const { error } = await supabase.from('recipes').insert(lot)
    if (error) {
      erreurs.push(`Erreur lot ${Math.floor(i / 50) + 1} : ${error.message}`)
    } else {
      imported += lot.length
    }
  }

  return NextResponse.json({ imported, errors: erreurs })
}
