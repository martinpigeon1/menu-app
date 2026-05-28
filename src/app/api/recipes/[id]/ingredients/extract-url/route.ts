import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Tu es un assistant qui extrait les ingrédients d'une recette depuis le contenu d'une page web. Réponds UNIQUEMENT en JSON avec ce format:
{
  "default_servings": number,
  "ingredients": [
    { "name": string, "quantity": number|null, "unit": string|null }
  ]
}
Déduis le nombre de portions depuis la recette si visible, sinon utilise 4. Normalise les unités: g, kg, ml, l, cl, c.à.s, c.à.c, pincée. Sépare bien chaque ingrédient.`

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
    max_tokens: 1024,
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
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json(
      { error: 'Impossible de parser la réponse de Claude', raw: text },
      { status: 422 }
    )
  }
}
