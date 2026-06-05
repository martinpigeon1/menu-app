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
  cook_time_minutes: number | null
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

export interface RecipeStep {
  id: string
  recipe_id: string
  step_number: number
  // Ingredient quantities wrapped in [[value]] placeholders, scaled at render time.
  text: string
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

// --- Picnic integration (Phase 4) ---

export interface PicnicCredentials {
  household_id: string
  email: string | null
  auth_key: string
  created_at: string
  updated_at: string
}

export interface PicnicIngredientMapping {
  id: string
  household_id: string
  ingredient_name: string
  picnic_product_id: string
  picnic_product_name: string
  picnic_product_image_url: string | null
  dutch_name: string | null
  remembered: boolean
  last_used_at: string
}

// A Picnic product as surfaced to the client (never includes auth data)
export interface PicnicProduct {
  product_id: string
  product_name: string
  image_url: string | null
  price: number | null // in euros
  unit_quantity: string | null
}

export type MatchConfidence = 'high' | 'medium' | 'low'

export interface PicnicReviewItem {
  ingredient: ShoppingItem
  suggested_product: PicnicProduct | null
  quantity_to_add: number
  confidence: MatchConfidence
  has_previous_mapping: boolean
  dutch_name?: string | null
}

export interface PicnicAutoItem {
  ingredient: ShoppingItem
  product: PicnicProduct
  quantity_to_add: number
  remembered: true
  dutch_name?: string | null
}

export interface PicnicMatchResult {
  to_review: PicnicReviewItem[]
  auto_added: PicnicAutoItem[]
  not_found: { ingredient: ShoppingItem }[]
}

// --- Chef AI assistant (Phase 5) ---

export interface ChefMessage {
  role: 'user' | 'assistant'
  content: string // assistant content may contain [[RECIPE:{id}:{name}]] markers
  timestamp: string // ISO
  suggested_recipe_ids?: string[]
}

// Compact recipe surfaced by the chat for inline cards.
export interface ChefSuggestedRecipe {
  id: string
  name: string
  type: RecipeType
  rating: number | null
  author: string | null
}
