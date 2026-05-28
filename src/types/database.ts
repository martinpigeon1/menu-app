// Types TypeScript correspondant au schéma de la base de données

export type RecipeType = 'Plat' | 'Salade' | 'Soupe' | 'Entrée' | 'Accompagnement' | 'Dessert'
export type RecipeSource = 'livre' | 'site' | 'autre'

export interface Recipe {
  id: string
  household_id: string
  name: string
  author: string | null
  source: RecipeSource | null
  source_url: string | null
  source_book: string | null
  source_page: number | null
  type: RecipeType
  rating: number | null
  prep_time_minutes: number | null
  notes: string | null
  default_servings: number
  created_at: string
  updated_at: string
}

export interface Ingredient {
  id: string
  recipe_id: string
  name: string
  quantity: number | null
  unit: string | null
  sort_order: number
  created_at: string
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

export interface MealPlan {
  id: string
  household_id: string
  week_start: string // 'YYYY-MM-DD'
  created_at: string
}

export interface MealPlanRecipe {
  id: string
  meal_plan_id: string
  recipe_id: string
  servings: number
  day_of_week: number | null // 0=Mon … 6=Sun
  meal_type: 'lunch' | 'dinner'
  sort_order: number
}

export interface MealPlanRecipeWithDetails extends MealPlanRecipe {
  recipe: Recipe & { ingredients: Ingredient[] }
}

export interface MealPlanWithRecipes extends MealPlan {
  meal_plan_recipes: MealPlanRecipeWithDetails[]
}

export interface ShoppingItem {
  name: string
  quantity: number | null
  unit: string | null
}

export interface ShoppingCategory {
  category: string
  ingredients: ShoppingItem[]
}

export interface ShoppingList {
  categories: ShoppingCategory[]
  missing_recipes: string[]
}
