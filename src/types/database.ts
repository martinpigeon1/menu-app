// Types TypeScript correspondant au schéma de la base de données

export type RecipeType = 'Plat' | 'Salade' | 'Soupe' | 'Entrée' | 'Accompagnement' | 'Dessert'
export type RecipeSource = 'livre' | 'site' | 'autre'

export interface Recipe {
  id: string
  household_id: string
  name: string
  source: RecipeSource | null
  source_url: string | null
  source_book: string | null
  source_page: number | null
  type: RecipeType
  rating: number | null
  prep_time_minutes: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Household {
  id: string
  name: string
  created_at: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  role: 'admin' | 'member'
}
