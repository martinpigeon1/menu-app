// Tableau de bord (accueil) — vue de la semaine + accès rapide au Chef
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMondayOf, toDateString, formatWeekRange } from '@/lib/weeks'
import OnboardingForm from './OnboardingForm'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

const QUICK_CHIPS: { label: string; q: string }[] = [
  { label: '🥦 Végétarien', q: 'Propose-moi des plats végétariens.' },
  { label: '⏱ Rapide', q: 'Je voudrais quelque chose de rapide, moins de 30 minutes.' },
  { label: '🐟 Poisson', q: 'Propose-moi des recettes de poisson.' },
]

interface PlanRecipeRow {
  day_of_week: number | null
  sort_order: number
  recipe: { name: string } | null
}

export default async function HomePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: householdMember } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!householdMember) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 w-full max-w-md shadow-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🏠</div>
            <h2 className="text-xl font-semibold text-gray-800">Bienvenue !</h2>
            <p className="text-gray-500 text-sm mt-1">
              Commence par créer ton foyer pour gérer tes recettes.
            </p>
          </div>
          <OnboardingForm />
        </div>
      </div>
    )
  }

  const monday = getMondayOf()
  const weekStr = toDateString(monday)

  const { data: plan } = await supabase
    .from('meal_plans')
    .select('week_start, meal_plan_recipes(day_of_week, sort_order, recipe:recipe_id(name))')
    .eq('household_id', householdMember.household_id)
    .eq('week_start', weekStr)
    .maybeSingle()

  const rows = (plan?.meal_plan_recipes ?? []) as unknown as PlanRecipeRow[]
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order)
  const byDay: string[][] = Array.from({ length: 7 }, () => [])
  for (const r of sorted) {
    if (r.recipe && r.day_of_week !== null && r.day_of_week >= 0 && r.day_of_week <= 6) {
      byDay[r.day_of_week].push(r.recipe.name)
    }
  }
  const totalPlanned = byDay.reduce((n, arr) => n + arr.length, 0)

  return (
    <div className="space-y-5">
      {/* Section A — Aperçu de la semaine */}
      <Link
        href="/planner?week=current"
        className="block bg-white rounded-2xl border border-gray-200 p-4 hover:border-green-200 hover:shadow-sm transition-all"
      >
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-900 text-sm">
            Cette semaine · <span className="text-gray-500 font-normal">{formatWeekRange(monday)}</span>
          </p>
          <span className="text-gray-300 text-lg leading-none">›</span>
        </div>

        {totalPlanned === 0 ? (
          <p className="text-sm text-gray-400">Aucun repas planifié · <span className="text-green-600">Ajouter →</span></p>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((label, d) => {
              const names = byDay[d]
              const weekend = d >= 5
              return (
                <div
                  key={d}
                  className={`rounded-lg px-1 py-1.5 min-w-0 ${weekend ? 'bg-amber-50' : 'bg-gray-50'}`}
                >
                  <p className={`text-[10px] font-medium text-center mb-0.5 ${weekend ? 'text-amber-600' : 'text-gray-400'}`}>
                    {label}
                  </p>
                  <p className="text-[11px] text-gray-700 text-center truncate leading-tight">
                    {names[0] ?? '—'}
                  </p>
                  {names.length > 1 && (
                    <p className="text-[10px] text-gray-400 text-center leading-tight">+{names.length - 1}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Link>

      {/* Section B — Accès rapide au Chef */}
      <div className="space-y-2">
        <Link
          href="/chef"
          className="flex items-center gap-2 bg-white rounded-2xl border border-gray-200 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all"
        >
          <span className="text-lg">💬</span>
          <span className="text-sm text-gray-400">Qu&apos;est-ce qu&apos;on mange ce soir ?</span>
        </Link>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {QUICK_CHIPS.map((chip) => (
            <Link
              key={chip.label}
              href={`/chef?q=${encodeURIComponent(chip.q)}`}
              className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              {chip.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
