import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  )
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface EligibleRecipe {
  id: string
  name: string
  source_url: string
  default_servings: number
}

async function processRecipe(
  recipe: EligibleRecipe,
  admin: SupabaseClient,
  signal: AbortSignal
): Promise<{ count: number }> {
  // Fetch page
  const res = await fetch(recipe.source_url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MenuApp/1.0)' },
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const pageText = stripHtml(html).slice(0, 20000)

  // Claude extraction
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Voici le contenu de la page de la recette :\n\n${pageText}` }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Réponse Claude non parseable')
  const parsed = JSON.parse(jsonMatch[0])

  const ingredients: { name: string; quantity: number | null; unit: string | null }[] = parsed.ingredients ?? []
  const defaultServings: number = parsed.default_servings ?? 4

  // Save (service role — no RLS check needed)
  await admin.from('ingredients').delete().eq('recipe_id', recipe.id)
  await admin.from('recipes').update({ default_servings: defaultServings }).eq('id', recipe.id)

  if (ingredients.length > 0) {
    const rows = ingredients.map((ing, i) => ({
      recipe_id: recipe.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      sort_order: i,
    }))
    const { error } = await admin.from('ingredients').insert(rows)
    if (error) throw new Error(`DB: ${error.message}`)
  }

  return { count: ingredients.length }
}

export async function POST(request: NextRequest) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = adminClient()

  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Foyer introuvable' }, { status: 403 })

  // Find candidates: any public URL
  const { data: candidates } = await admin
    .from('recipes')
    .select('id, name, source_url, default_servings')
    .eq('household_id', member.household_id)
    .like('source_url', 'http%')

  if (!candidates || candidates.length === 0) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'init', total: 0, recipes: [] })}\n\n`))
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', total: 0, success: 0, errors: 0 })}\n\n`))
        controller.close()
      },
    })
    return new Response(stream, { headers: sseHeaders() })
  }

  // Exclude recipes that already have ingredients
  const ids = candidates.map((r) => r.id)
  const { data: existingIngs } = await admin
    .from('ingredients')
    .select('recipe_id')
    .in('recipe_id', ids)

  const hasIngredients = new Set((existingIngs ?? []).map((r) => r.recipe_id))
  const eligible: EligibleRecipe[] = (candidates as EligibleRecipe[]).filter((r) => !hasIngredients.has(r.id))

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      send({ type: 'init', total: eligible.length, recipes: eligible.map((r) => ({ id: r.id, name: r.name })) })

      let successCount = 0
      let errorCount = 0

      for (const recipe of eligible) {
        send({ type: 'progress', recipe_id: recipe.id, recipe_name: recipe.name, status: 'running' })

        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), 15000)

        try {
          const result = await processRecipe(recipe, admin, abort.signal)
          clearTimeout(timer)
          send({ type: 'progress', recipe_id: recipe.id, recipe_name: recipe.name, status: 'success', ingredient_count: result.count })
          successCount++
        } catch (e) {
          clearTimeout(timer)
          const msg = abort.signal.aborted
            ? 'Timeout (15s)'
            : e instanceof Error ? e.message : 'Erreur inconnue'
          send({ type: 'progress', recipe_id: recipe.id, recipe_name: recipe.name, status: 'error', error: msg })
          errorCount++
        }
      }

      send({ type: 'complete', total: eligible.length, success: successCount, errors: errorCount })
      controller.close()
    },
  })

  return new Response(stream, { headers: sseHeaders() })
}

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disables nginx buffering (Vercel)
  }
}
