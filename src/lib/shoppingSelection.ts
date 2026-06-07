// The day-picker stores the chosen meals in sessionStorage so both entry
// points (Planner button, Courses tab) share the same selection for the
// current visit, without polluting the URL with long id lists.

export interface ShoppingSelection {
  recipeIds: string[] // meal_plan_recipe ids
  firstDate: string // YYYY-MM-DD (earliest selected day)
  lastDate: string // YYYY-MM-DD (latest selected day)
}

const KEY = 'shopping-selection'

export function saveSelection(sel: ShoppingSelection) {
  try { sessionStorage.setItem(KEY, JSON.stringify(sel)) } catch {}
}

export function loadSelection(): ShoppingSelection | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ShoppingSelection
  } catch {}
  return null
}

export function clearSelection() {
  try { sessionStorage.removeItem(KEY) } catch {}
}
