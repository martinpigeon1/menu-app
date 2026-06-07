// Tableau de bord (accueil) — prochains repas, favoris, accès au Chef
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { amsterdamToday, getMondayOf, addWeeks, toDateString, fromDateString } from '@/lib/weeks'
import { Recipe } from '@/types/database'
import OnboardingForm from './OnboardingForm'
import FavoritesRow from '@/components/ui/FavoritesRow'

const FR_WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const CHEF_CHIPS: { label: string; q: string }[] = [
  { label: '🥦 Végétarien ce soir', q: 'Je voudrais quelque chose de végétarien ce soir.' },
  { label: '⏱ Quelque chose de rapide', q: 'Je voudrais quelque chose de rapide ce soir.' },
  { label: "🐟 On n'a pas eu de poisson cette semaine", q: "On n'a pas eu de poisson cette semaine, propose-moi une recette de poisson." },
]

interface PlanRow {
  week_start: string
  meal_plan_recipes: {
    day_of_week: number | null
    recipe: { id: string; name: string; author: string | null } | null
  }[]
}

interface UpcomingMeal {
  date: Date
  id: string
  name: string
  author: string | null
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dayLabel(date: Date, today: Date, tomorrow: Date): string {
  if (sameDay(date, today)) return "Aujourd'hui"
  if (sameDay(date, tomorrow)) return 'Demain'
  const weekday = FR_WEEKDAYS[(date.getDay() + 6) % 7] // JS 0=Sun → our 6
  return `${weekday} ${date.getDate()} ${FR_MONTHS[date.getMonth()]}`
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

  const hid = householdMember.household_id
  // Include the previous week so a meal from "yesterday" (a Sunday) is still
  // caught when today is a Monday.
  const prevMonday = toDateString(addWeeks(getMondayOf(), -1))

  const [plansRes, favRes, countRes] = await Promise.all([
    supabase
      .from('meal_plans')
      .select('week_start, meal_plan_recipes(day_of_week, recipe:recipe_id(id, name, author))')
      .eq('household_id', hid)
      .gte('week_start', prevMonday),
    // Top recipes by rating (NULLs last), filled with the most recent unrated
    // recipes — so the section is never empty when the household has recipes.
    supabase
      .from('recipes')
      .select('*')
      .eq('household_id', hid)
      .order('rating', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', hid),
  ])

  const favorites = (favRes.data ?? []) as Recipe[]
  const totalRecipes = countRes.count ?? 0

  // Build the upcoming-meals list (assigned day >= yesterday, chronological).
  const today = amsterdamToday()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  const meals: UpcomingMeal[] = []
  for (const plan of (plansRes.data ?? []) as unknown as PlanRow[]) {
    const base = fromDateString(plan.week_start)
    for (const mpr of plan.meal_plan_recipes ?? []) {
      if (mpr.day_of_week === null || !mpr.recipe) continue
      const date = new Date(base)
      date.setDate(base.getDate() + mpr.day_of_week)
      if (date >= yesterday) {
        meals.push({ date, id: mpr.recipe.id, name: mpr.recipe.name, author: mpr.recipe.author })
      }
    }
  }
  meals.sort((a, b) => a.date.getTime() - b.date.getTime())
  const upcoming = meals.slice(0, 4)

  return (
    <div className="space-y-7">
      {/* SECTION 1 — Mes prochains repas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Mes prochains repas</h2>
        {upcoming.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center space-y-3">
            <p className="text-sm text-gray-500">📅 Rien de planifié pour l&apos;instant</p>
            <Link
              href="/planner"
              className="inline-block text-sm font-medium text-green-600 hover:text-green-700"
            >
              Ajouter des recettes à ma semaine →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((meal, i) => (
              <Link
                key={`${meal.id}-${i}`}
                href={`/recettes/${meal.id}`}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-green-600 uppercase tracking-wide">
                    {dayLabel(meal.date, today, tomorrow)}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{meal.name}</p>
                  {meal.author && <p className="text-xs text-gray-400 truncate">{meal.author}</p>}
                </div>
                <span className="text-gray-300 text-lg leading-none shrink-0">›</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 2 — Mes favoris */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">Mes favoris</h2>
        {favorites.length > 0 ? (
          <FavoritesRow favorites={favorites} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl p-5 text-center space-y-3">
            <p className="text-sm text-gray-500">Vous n&apos;avez pas encore de recettes</p>
            <Link href="/recettes" className="inline-block text-sm font-medium text-green-600 hover:text-green-700">
              Ajouter mes premières recettes →
            </Link>
          </div>
        )}
      </section>

      {/* SECTION 3 — Le Chef */}
      <section className="space-y-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">💬 Votre assistant menu</h2>
            <p className="text-sm text-gray-500 mt-1">
              Dites-lui ce que vous avez au frigo, vos envies du soir, vos contraintes —
              il connaît vos {totalRecipes} recette{totalRecipes !== 1 ? 's' : ''} et votre historique.
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            {CHEF_CHIPS.map((chip) => (
              <Link
                key={chip.label}
                href={`/chef?q=${encodeURIComponent(chip.q)}`}
                className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                {chip.label}
              </Link>
            ))}
          </div>

          <Link
            href="/chef"
            className="block text-center bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            Ouvrir le Chef →
          </Link>
        </div>
      </section>
    </div>
  )
}
