import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SYSTEM_PROMPT = `Tu es un assistant culinaire. Depuis le contenu d'une page web de recette, extrais UNIQUEMENT les temps en minutes:
- prep_minutes: temps de préparation (null si non indiqué)
- cook_minutes: temps de cuisson (null si non indiqué)
Réponds UNIQUEMENT en JSON, sans texte autour: {"prep_minutes": number|null, "cook_minutes": number|null}`

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
  prep_time_minutes: number | null
  cook_time_minutes: number | null
}

async function resolveHousehold(request: NextRequest) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) }

  const admin = adminClient()
  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: NextResponse.json({ error: 'Foyer introuvable' }, { status: 403 }) }

  return { admin, household_id: member.household_id as string }
}

// Recipes with a public URL that are still missing prep and/or cook time.
async function fetchEligible(admin: SupabaseClient, householdId: string): Promise<EligibleRecipe[]> {
  const { data } = await admin
    .from('recipes')
    .select('id, name, source_url, prep_time_minutes, cook_time_minutes')
    .eq('household_id', householdId)
    .like('source_url', 'http%')
    .or('prep_time_minutes.is.null,cook_time_minutes.is.null')
  return (data ?? []) as EligibleRecipe[]
}

// GET → count of eligible recipes (for the one-time settings trigger).
export async function GET(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return ctx.error
  const eligible = await fetchEligible(ctx.admin, ctx.household_id)
  return NextResponse.json({ count: eligible.length })
}

async function processRecipe(
  recipe: EligibleRecipe,
  admin: SupabaseClient,
  signal: AbortSignal
): Promise<{ prepSet: boolean; cookSet: boolean }> {
  const res = await fetch(recipe.source_url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MenuApp/1.0)' },
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const pageText = stripHtml(html).slice(0, 20000)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Voici le contenu de la page de la recette :\n\n${pageText}` }],
  })

  const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Réponse Claude non parseable')
  const parsed = JSON.parse(jsonMatch[0])

  const prep = typeof parsed.prep_minutes === 'number' ? parsed.prep_minutes : null
  const cook = typeof parsed.cook_minutes === 'number' ? parsed.cook_minutes : null

  // Update ONLY the fields that are currently null.
  const update: Record<string, number> = {}
  if (recipe.prep_time_minutes == null && prep != null) update.prep_time_minutes = prep
  if (recipe.cook_time_minutes == null && cook != null) update.cook_time_minutes = cook

  if (Object.keys(update).length > 0) {
    const { error } = await admin.from('recipes').update(update).eq('id', recipe.id)
    if (error) throw new Error(`DB: ${error.message}`)
  }

  return { prepSet: 'prep_time_minutes' in update, cookSet: 'cook_time_minutes' in update }
}

function sseHeaders() {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
}

export async function POST(request: NextRequest) {
  const ctx = await resolveHousehold(request)
  if ('error' in ctx) return ctx.error
  const { admin, household_id } = ctx

  const eligible = await fetchEligible(admin, household_id)
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      send({ type: 'init', total: eligible.length })

      let successCount = 0
      let errorCount = 0

      for (const recipe of eligible) {
        send({ type: 'progress', recipe_id: recipe.id, recipe_name: recipe.name, status: 'running' })

        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), 15000)

        try {
          const result = await processRecipe(recipe, admin, abort.signal)
          clearTimeout(timer)
          send({
            type: 'progress',
            recipe_id: recipe.id,
            recipe_name: recipe.name,
            status: 'success',
            prep_set: result.prepSet,
            cook_set: result.cookSet,
          })
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
