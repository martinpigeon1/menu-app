// Liste des recettes (déplacée depuis / vers /recettes)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RecipesList from '../RecipesList'
import OnboardingForm from '../OnboardingForm'

export default async function RecettesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: householdMember } = await supabase
    .from('household_members')
    .select('household_id, role')
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

  const { data: recipesRaw, error } = await supabase
    .from('recipes')
    .select('*, ingredients(count)')
    .eq('household_id', householdMember.household_id)
    .order('name', { ascending: true })

  if (error) {
    console.error('Erreur chargement recettes:', error)
  }

  const ingredientCounts: Record<string, number> = {}
  const recipes = (recipesRaw ?? []).map((row) => {
    const ingList = row.ingredients as { count: number }[] | null
    ingredientCounts[row.id] = ingList?.[0]?.count ?? 0
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { ingredients: _ing, ...recipe } = row
    return recipe
  })

  const authors = [...new Set(
    (recipes ?? []).map((r) => r.author).filter((a): a is string => !!a)
  )].sort((a, b) => a.localeCompare(b, 'fr'))

  return <RecipesList recipes={recipes ?? []} authors={authors} ingredientCounts={ingredientCounts} />
}
