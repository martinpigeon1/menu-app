// Page principale — liste des recettes
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RecipesList from './RecipesList'
import OnboardingForm from './OnboardingForm'

export default async function HomePage() {
  const supabase = await createClient()

  // Récupérer l'utilisateur courant
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer le household de l'utilisateur
  const { data: householdMember } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .single()

  // Si l'utilisateur n'a pas encore de household, afficher l'onboarding
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

  // Récupérer les recettes du household
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('household_id', householdMember.household_id)
    .order('name', { ascending: true })

  if (error) {
    console.error('Erreur chargement recettes:', error)
  }

  return <RecipesList recipes={recipes ?? []} householdId={householdMember.household_id} />
}
