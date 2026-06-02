import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Tu es un assistant culinaire. Extrais TOUTES les informations de cette photo de recette.

1. Métadonnées:
   - titre de la recette
   - auteur / source (ex: "Yummix", "Claire au Matcha", "Cookidoo")
   - livre source si visible (ex: "Simple & healthy")
   - type de plat parmi exactement: Plat, Soupe, Salade, Entrée, Accompagnement, Dessert
   - nombre de portions
   - temps de préparation (minutes)
   - temps de cuisson (minutes)
   - notes (la section de notes en italique en bas si présente)
2. La liste d'ingrédients structurée
3. Les étapes de la recette, en entourant UNIQUEMENT les quantités d'ingrédients avec [[valeur]].

RÈGLE CRITIQUE pour les placeholders [[]] :
- OUI: quantités d'ingrédients → [[6]] œufs, [[200]]g de chocolat, [[1]] pincée de sel
- NON: paramètres Thermomix → temps (6 minutes), vitesses (vitesse 3), températures (60°C, 200°C)
- NON: durées de cuisson → 20 minutes au four
- En cas de doute: ne pas mettre de placeholder

Réponds UNIQUEMENT en JSON:
{
  "name": string,
  "author": string | null,
  "source_book": string | null,
  "type": "Plat"|"Soupe"|"Salade"|"Entrée"|"Accompagnement"|"Dessert",
  "servings": number,
  "prep_minutes": number | null,
  "cook_minutes": number | null,
  "ingredients": [{"name": string, "quantity": number|null, "unit": string|null}],
  "steps": [{"step_number": number, "text": string}],
  "notes": string | null
}`

const VALID_TYPES = ['Plat', 'Soupe', 'Salade', 'Entrée', 'Accompagnement', 'Dessert']

function authClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )
}

export async function POST(request: NextRequest) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: 'Extrais toute la recette de cette photo.' },
        ],
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Pas de JSON trouvé dans la réponse')
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      name: parsed.name ?? '',
      author: parsed.author ?? null,
      source_book: parsed.source_book ?? null,
      source_url: null,
      type: VALID_TYPES.includes(parsed.type) ? parsed.type : 'Plat',
      servings: parsed.servings ?? 4,
      prep_minutes: parsed.prep_minutes ?? null,
      cook_minutes: parsed.cook_minutes ?? null,
      ingredients: parsed.ingredients ?? [],
      steps: parsed.steps ?? [],
      notes: parsed.notes ?? null,
    })
  } catch {
    return NextResponse.json(
      { error: 'Impossible de parser la réponse de Claude', raw: text },
      { status: 422 }
    )
  }
}
