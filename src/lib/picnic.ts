// Helpers partagés pour l'intégration Picnic (Phase 4).
// L'auth_key Picnic est sensible : il ne transite jamais vers le client.
import PicnicClient from 'picnic-api'
import { createServerClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

type PicnicCountry = 'NL' | 'DE' | 'FR'

// Picnic opère aux Pays-Bas, en Allemagne et en France. Le code pays détermine
// le catalogue ET l'endpoint de connexion : il DOIT correspondre au pays du
// compte Picnic. Configurable via PICNIC_COUNTRY_CODE (défaut "NL" comme demandé).
export const PICNIC_COUNTRY: PicnicCountry =
  (process.env.PICNIC_COUNTRY_CODE as PicnicCountry) || 'NL'

// Résultat de recherche tel que renvoyé par catalog.search()
export interface PicnicSellingUnit {
  id: string
  name: string
  image_id: string
  display_price: number // en centimes
  unit_quantity: string
  max_count: number
}

export type PicnicClientInstance = InstanceType<typeof PicnicClient>

export function createPicnicClient(authKey?: string | null): PicnicClientInstance {
  return new PicnicClient({
    countryCode: PICNIC_COUNTRY,
    ...(authKey ? { authKey } : {}),
  })
}

// Les images produit sont publiques (pas d'auth nécessaire).
export function picnicImageUrl(
  imageId: string | null | undefined,
  size: 'tiny' | 'small' | 'medium' | 'large' = 'medium'
): string | null {
  if (!imageId) return null
  const host = `storefront-prod.${PICNIC_COUNTRY.toLowerCase()}.picnicinternational.com`
  return `https://${host}/static/images/${imageId}/${size}.png`
}

export function centsToEuros(cents: number | null | undefined): number | null {
  if (cents == null) return null
  return Math.round(cents) / 100
}

// Normalise un nom d'ingrédient : minuscules, sans accents superflus d'espace,
// et au singulier approximatif (retire un "s"/"x" final). Suffisant pour
// regrouper "courgettes" -> "courgette", "œufs" -> "œuf".
export function normalizeIngredientName(name: string): string {
  let n = name.toLowerCase().trim().replace(/\s+/g, ' ')
  if (n.length > 3 && !n.endsWith('ss')) {
    n = n.replace(/[sx]$/, '')
  }
  return n
}

// --- Supabase helpers (mêmes patterns que les routes existantes) ---

export function authClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  )
}

export function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface HouseholdContext {
  userId: string
  householdId: string
  admin: SupabaseClient
}

// Résout l'utilisateur authentifié et son foyer. Renvoie null si non authentifié
// ou sans foyer (le caller renvoie alors le bon statut HTTP).
export async function resolveHousehold(
  request: NextRequest
): Promise<HouseholdContext | { error: string; status: number }> {
  const supabase = authClient(request)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié', status: 401 }

  const admin = adminClient()
  const { data: member } = await admin
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!member) return { error: 'Foyer introuvable', status: 403 }

  return { userId: user.id, householdId: member.household_id, admin }
}

// Petite aide pour exécuter des tâches async avec concurrence limitée.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}
