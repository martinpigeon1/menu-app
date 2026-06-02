import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const FIELDS = `- name: titre de la recette
- author: auteur/source (ex: Yummix, Claire au Matcha)
- source_book: nom du livre si applicable
- type: Plat|Soupe|Salade|Entrée|Accompagnement|Dessert
- servings: nombre de portions
- prep_minutes: temps de préparation en minutes
- cook_minutes: temps de cuisson en minutes
- ingredients: [{name, quantity, unit}]
- steps: [{step_number, text}] avec [[N]] pour les quantités d'ingrédients, JAMAIS pour temps/températures/vitesses
- notes: notes ou conseils en fin de recette

RÈGLE [[ ]] : entoure UNIQUEMENT les quantités d'ingrédients ([[6]] œufs, [[200]]g de chocolat, [[1]] pincée de sel). JAMAIS les temps (6 minutes), vitesses (vitesse 3), températures (60°C, 200°C). En cas de doute, ne pas mettre de placeholder.

Réponds UNIQUEMENT en JSON, sans texte autour.`

const PHOTO_PROMPT = `Tu es un assistant culinaire. Extrais depuis cette photo de recette:
${FIELDS}`

const URL_PROMPT = `Tu es un assistant culinaire. Extrais depuis le contenu de cette page web de recette:
${FIELDS}
Ignore: publicités, navigation, commentaires, suggestions d'autres recettes.`

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

function normalize(parsed: Record<string, unknown>, sourceUrl: string | null, isCookidoo: boolean) {
  return {
    name: (parsed.name as string) ?? '',
    author: (parsed.author as string) ?? null,
    source_book: (parsed.source_book as string) ?? null,
    source_url: sourceUrl,
    type: VALID_TYPES.includes(parsed.type as string) ? (parsed.type as string) : 'Plat',
    servings: (parsed.servings as number) ?? 4,
    prep_minutes: (parsed.prep_minutes as number) ?? null,
    cook_minutes: (parsed.cook_minutes as number) ?? null,
    ingredients: (parsed.ingredients as unknown[]) ?? [],
    // Cookidoo steps stay on Cookidoo / the Thermomix.
    steps: isCookidoo ? [] : ((parsed.steps as unknown[]) ?? []),
    notes: (parsed.notes as string) ?? null,
    is_cookidoo: isCookidoo,
  }
}

export async function POST(request: NextRequest) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const contentType = request.headers.get('content-type') || ''

  // ---- Photo mode (multipart with a file) ----
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: PHOTO_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Extrais toute la recette de cette photo.' },
          ],
        },
      ],
    })
    return parseAndRespond(message, null, false)
  }

  // ---- URL mode (JSON with a url) ----
  const body = await request.json().catch(() => ({}))
  const url = (body as { url?: string }).url
  if (!url) return NextResponse.json({ error: 'URL ou fichier manquant' }, { status: 400 })

  const isCookidoo = url.includes('cookidoo')

  let pageText: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MenuApp/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    pageText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20000)
  } catch (err) {
    return NextResponse.json(
      { error: `Impossible de récupérer la page : ${err instanceof Error ? err.message : 'erreur réseau'}` },
      { status: 502 }
    )
  }

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: URL_PROMPT,
    messages: [{ role: 'user', content: `Voici le contenu de la page de la recette :\n\n${pageText}` }],
  })
  return parseAndRespond(message, url, isCookidoo)
}

function parseAndRespond(message: Anthropic.Message, sourceUrl: string | null, isCookidoo: boolean) {
  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Pas de JSON trouvé dans la réponse')
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(normalize(parsed, sourceUrl, isCookidoo))
  } catch {
    return NextResponse.json(
      { error: 'Impossible de parser la réponse de Claude', raw: text },
      { status: 422 }
    )
  }
}
