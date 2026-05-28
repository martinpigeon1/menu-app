import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT = `Tu es un assistant qui extrait les ingrédients d'une recette depuis une photo. Réponds UNIQUEMENT en JSON avec ce format:
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

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mediaType = (file.type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          { type: 'text', text: 'Extrais les ingrédients de cette recette.' },
        ],
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
