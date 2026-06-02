import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Extrais les étapes de cette recette depuis le contenu HTML.
Ignore: publicités, navigation, commentaires, suggestions d'autres recettes.
Entoure UNIQUEMENT les quantités d'ingrédients avec [[valeur]].
Même règle que précédemment: jamais les temps/températures/vitesses.

RÈGLE CRITIQUE pour les placeholders [[]] :
- OUI: quantités d'ingrédients → [[6]] œufs, [[200]]g de chocolat, [[1]] pincée de sel
- NON: paramètres Thermomix → temps (6 minutes), vitesses (vitesse 3), températures (60°C, 200°C)
- NON: durées de cuisson → 20 minutes au four
- En cas de doute: ne pas mettre de placeholder

Réponds UNIQUEMENT en JSON:
{
  "servings": number,
  "prep_minutes": number | null,
  "cook_minutes": number | null,
  "steps": [{"step_number": number, "text": string}],
  "notes": string | null
}`

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

  const body = await request.json()
  const { url } = body as { url: string }
  if (!url) return NextResponse.json({ error: 'URL manquante' }, { status: 400 })

  if (url.includes('cookidoo')) {
    return NextResponse.json(
      { error: 'L\'extraction depuis Cookidoo n\'est pas disponible (site protégé).' },
      { status: 403 }
    )
  }

  let pageText: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MenuApp/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    // Strip HTML tags and collapse whitespace
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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Voici le contenu de la page de la recette :\n\n${pageText}`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Pas de JSON trouvé dans la réponse')
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      servings: parsed.servings ?? null,
      prep_minutes: parsed.prep_minutes ?? null,
      cook_minutes: parsed.cook_minutes ?? null,
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
