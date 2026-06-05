import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { mondayOf, dayLabel, currentMonthFr, currentSeasonFr } from '@/lib/chef'
import { ChefMessage, RecipeType } from '@/types/database'

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

interface RecipeRow {
  id: string
  name: string
  type: RecipeType
  rating: number | null
  author: string | null
  prep_time_minutes: number | null
}

interface PlanRow {
  week_start: string
  meal_plan_recipes: { day_of_week: number | null; recipe: { name: string } | null }[]
}

function buildSystemPrompt(
  recipes: RecipeRow[],
  currentPlan: string,
  history: string
): string {
  const month = currentMonthFr()
  const season = currentSeasonFr()

  const recipeList = recipes
    .map((r) => `${r.id} | ${r.name} | ${r.type} | ★${r.rating ?? '-'} | ${r.author ?? '-'} | ${r.prep_time_minutes ?? '?'}min`)
    .join('\n')

  return `Tu es un assistant culinaire expert qui aide une famille à Amsterdam à planifier ses repas de la semaine. Tu es chaleureux, pratique et concis.

RÈGLES IMPORTANTES:
- Suggère UNIQUEMENT des recettes de la liste ci-dessous
- Ne suggère jamais de recettes que tu inventes
- Pour référencer une recette, utilise TOUJOURS ce format exact: [[RECIPE:{id}:{name}]]
- Tiens compte des notes (★5 = excellent, ★1 = décevant)
- Évite les recettes faites dans les 4 dernières semaines
- Adapte tes suggestions à la saison (${season}) et au mois (${month})
- Réponds en français, de façon concise (3-4 phrases max par réponse)
- Si la demande est vague, pose UNE seule question de clarification

RECETTES DISPONIBLES:
${recipeList || 'Aucune recette disponible'}

PLAN DE CETTE SEMAINE:
${currentPlan || "Aucune recette planifiée pour l'instant"}

RECETTES DES 4 DERNIÈRES SEMAINES (à éviter):
${history || 'Aucun historique disponible'}

MOIS ACTUEL: ${month} | SAISON: ${season}`
}

export async function POST(request: NextRequest) {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const message = (body as { message?: string }).message?.trim()
  if (!message) return NextResponse.json({ error: 'Message manquant' }, { status: 400 })

  const admin = adminClient()
  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return NextResponse.json({ error: 'Foyer introuvable' }, { status: 403 })

  const householdId = member.household_id as string
  const currentWeek = mondayOf(0)
  const historyWeeks = [1, 2, 3, 4].map((w) => mondayOf(w))

  // Load all context in parallel.
  const [recipesRes, plansRes, convRes] = await Promise.all([
    admin
      .from('recipes')
      .select('id, name, type, rating, author, prep_time_minutes')
      .eq('household_id', householdId)
      .order('name'),
    admin
      .from('meal_plans')
      .select('week_start, meal_plan_recipes(day_of_week, recipe:recipe_id(name))')
      .eq('household_id', householdId)
      .in('week_start', [currentWeek, ...historyWeeks]),
    getOrCreateConversation(admin, householdId, currentWeek),
  ])

  const recipes = (recipesRes.data ?? []) as RecipeRow[]
  const recipeMap = new Map(recipes.map((r) => [r.id, r]))
  const plans = (plansRes.data ?? []) as unknown as PlanRow[]

  // Current week's plan, sorted by day.
  const currentPlanRow = plans.find((p) => p.week_start === currentWeek)
  const currentPlanText = (currentPlanRow?.meal_plan_recipes ?? [])
    .filter((mpr) => mpr.recipe)
    .sort((a, b) => (a.day_of_week ?? 99) - (b.day_of_week ?? 99))
    .map((mpr) => {
      const label = dayLabel(mpr.day_of_week)
      return label ? `${label}: ${mpr.recipe!.name}` : mpr.recipe!.name
    })
    .join('\n')

  // Last 4 weeks' recipe names (deduped).
  const historyNames = new Set<string>()
  for (const p of plans) {
    if (p.week_start === currentWeek) continue
    for (const mpr of p.meal_plan_recipes ?? []) {
      if (mpr.recipe?.name) historyNames.add(mpr.recipe.name)
    }
  }
  const historyText = [...historyNames].join(', ')

  const conversation = convRes
  const priorMessages = (conversation.messages ?? []) as ChefMessage[]

  const now = new Date().toISOString()
  const userMessage: ChefMessage = { role: 'user', content: message, timestamp: now }

  // Last 20 messages for context; must start on a user turn for the API.
  const forClaude = [...priorMessages, userMessage]
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }))
  while (forClaude.length && forClaude[0].role !== 'user') forClaude.shift()

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let replyText: string
  try {
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: buildSystemPrompt(recipes, currentPlanText, historyText),
      messages: forClaude,
    })
    replyText = completion.content[0].type === 'text' ? completion.content[0].text : ''
  } catch {
    return NextResponse.json({ error: 'Le Chef est momentanément indisponible. Réessaie.' }, { status: 502 })
  }

  // Extract [[RECIPE:id:name]] markers, keep only real recipe ids.
  const ids: string[] = []
  const re = /\[\[RECIPE:([^:\]]+):[^\]]*\]\]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(replyText))) ids.push(match[1])
  const suggestedIds = [...new Set(ids)].filter((id) => recipeMap.has(id))
  const suggestedRecipes = suggestedIds.map((id) => {
    const r = recipeMap.get(id)!
    return { id: r.id, name: r.name, type: r.type, rating: r.rating, author: r.author }
  })

  // Persist both turns.
  const assistantMessage: ChefMessage = {
    role: 'assistant',
    content: replyText,
    timestamp: new Date().toISOString(),
    suggested_recipe_ids: suggestedIds,
  }
  const newMessages = [...priorMessages, userMessage, assistantMessage]
  await admin
    .from('chef_conversations')
    .update({ messages: newMessages, updated_at: new Date().toISOString() })
    .eq('id', conversation.id)

  return NextResponse.json({
    reply: replyText,
    suggested_recipe_ids: suggestedIds,
    suggested_recipes: suggestedRecipes,
  })
}

async function getOrCreateConversation(
  admin: ReturnType<typeof adminClient>,
  householdId: string,
  weekStart: string
) {
  const { data: found } = await admin
    .from('chef_conversations')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (found) return found

  const { data: created } = await admin
    .from('chef_conversations')
    .insert({ household_id: householdId, week_start: weekStart, messages: [] })
    .select()
    .single()
  return created
}
