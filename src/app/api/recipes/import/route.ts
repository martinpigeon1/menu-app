// API route : import de recettes depuis un fichier TSV
//
// Colonnes attendues (exactes) :
//   Auteur | Nom | Type de source | Lien | Page | Type de recettes |
//   Note (1-5) | Temps de préparation | Commentaires
//
// Ajouter ?preview=true pour obtenir un aperçu des 3 premières lignes sans insérer.
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { RecipeType, RecipeSource } from '@/types/database'

const TYPES_VALIDES: RecipeType[] = ['Plat', 'Salade', 'Soupe', 'Entrée', 'Accompagnement', 'Dessert']

// Normalise le type de recette (insensible à la casse)
function normaliserType(val: string): RecipeType {
  const v = val.trim()
  return TYPES_VALIDES.find((t) => t.toLowerCase() === v.toLowerCase()) ?? 'Plat'
}

// Dérive le type de source depuis les champs résolus
function deriveSource(sourceUrl: string | null, sourceBook: string | null): RecipeSource | null {
  if (sourceUrl) return 'site'
  if (sourceBook) return 'livre'
  return null
}

// Parse une ligne TSV en prenant en compte les cellules potentiellement vides en fin de ligne
function parseLigne(ligne: string): string[] {
  return ligne.split('\t').map((c) => c.trim())
}

interface RecetteImport {
  household_id: string
  name: string
  author: string | null
  type: RecipeType
  source: RecipeSource | null
  source_book: string | null
  source_url: string | null
  source_page: number | null
  rating: number | null
  prep_time_minutes: number | null
  notes: string | null
}

function parseTSV(text: string, householdId: string): { recettes: RecetteImport[]; erreurs: string[] } {
  const lignes = text.split('\n').map((l) => l.trimEnd()).filter(Boolean)
  if (lignes.length < 2) return { recettes: [], erreurs: ['Fichier vide ou sans données'] }

  const headers = parseLigne(lignes[0])

  // Index des colonnes exactes attendues
  const idx = {
    auteur:       headers.indexOf('Auteur'),
    nom:          headers.indexOf('Nom'),
    lien:         headers.indexOf('Lien'),
    page:         headers.indexOf('Page'),
    typeRecette:  headers.indexOf('Type de recettes'),
    note:         headers.indexOf('Note (1-5)'),
    temps:        headers.indexOf('Temps de préparation'),
    commentaires: headers.indexOf('Commentaires'),
    // "Type de source" ignoré
  }

  if (idx.nom === -1) {
    return { recettes: [], erreurs: ['Colonne "Nom" introuvable — vérifiez les en-têtes du fichier'] }
  }

  const recettes: RecetteImport[] = []
  const erreurs: string[] = []

  const get = (cols: string[], i: number) => (i !== -1 && i < cols.length ? cols[i] : '')

  for (let i = 1; i < lignes.length; i++) {
    const cols = parseLigne(lignes[i])

    const name = get(cols, idx.nom)
    if (!name) continue  // ignorer les lignes sans nom

    // "Auteur" → author (toujours, quelle que soit la valeur de Lien)
    // "Lien"  → source_url si URL, sinon source_book
    const auteur = get(cols, idx.auteur)
    const lien   = get(cols, idx.lien)

    const author: string | null = auteur || null

    let source_url: string | null = null
    let source_book: string | null = null

    if (lien.startsWith('http')) {
      source_url = lien
    } else if (lien) {
      source_book = lien
    }

    // Si pas de source_book depuis Lien, utiliser Auteur comme nom de source
    if (!source_book && auteur) source_book = auteur

    const source = deriveSource(source_url, source_book)

    const pageRaw = get(cols, idx.page)
    const source_page = pageRaw ? (parseInt(pageRaw) || null) : null

    const typeRaw = get(cols, idx.typeRecette)
    const type = normaliserType(typeRaw)
    if (typeRaw && !TYPES_VALIDES.find((t) => t.toLowerCase() === typeRaw.toLowerCase())) {
      erreurs.push(`Ligne ${i + 1} ("${name}") : type "${typeRaw}" inconnu, "Plat" utilisé par défaut`)
    }

    const noteRaw = get(cols, idx.note)
    const ratingFloat = noteRaw ? parseFloat(noteRaw.replace(',', '.')) : NaN
    const rating = isNaN(ratingFloat) ? null : Math.min(5, Math.max(0, Math.round(ratingFloat)))

    const tempsRaw = get(cols, idx.temps)
    const prep_time_minutes = tempsRaw ? (parseInt(tempsRaw) || null) : null

    const notes = get(cols, idx.commentaires) || null

    recettes.push({
      household_id: householdId,
      name,
      author,
      type,
      source,
      source_book,
      source_url,
      source_page,
      rating,
      prep_time_minutes,
      notes,
    })
  }

  return { recettes, erreurs }
}

export async function POST(request: NextRequest) {
  const isPreview = request.nextUrl.searchParams.get('preview') === 'true'

  // Vérification de l'authentification via les cookies de la requête
  const anonClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await anonClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // Service role : bypass RLS pour lire household_members et insérer les recettes
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: member } = await adminClient
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Aucun foyer associé à ce compte' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
  }

  const text = await file.text()
  const { recettes, erreurs } = parseTSV(text, member.household_id)

  if (recettes.length === 0) {
    return NextResponse.json(
      { error: 'Aucune recette valide trouvée dans le fichier', errors: erreurs },
      { status: 400 }
    )
  }

  // Mode aperçu : retourner les 3 premières lignes sans insérer
  if (isPreview) {
    return NextResponse.json({
      preview: recettes.slice(0, 3),
      total: recettes.length,
      errors: erreurs,
    })
  }

  // Import effectif par lots de 50
  let imported = 0
  const importErrors: string[] = [...erreurs]

  for (let i = 0; i < recettes.length; i += 50) {
    const lot = recettes.slice(i, i + 50)
    const { error } = await adminClient.from('recipes').insert(lot)
    if (error) {
      importErrors.push(`Erreur lot ${Math.floor(i / 50) + 1} : ${error.message}`)
    } else {
      imported += lot.length
    }
  }

  return NextResponse.json({ imported, total: recettes.length, errors: importErrors })
}
