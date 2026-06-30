// Jeu « Devine le mouvement » — page serveur.
// Charge le catalogue de peintures depuis Supabase (lecture publique via RLS),
// ne garde que les mouvements assez fournis pour être jouables, puis délègue
// tout le gameplay au composant client PaintingGame.
import { createClient } from '@/lib/supabase/server'
import PaintingGame from './PaintingGame'

// Données dynamiques : on relit le catalogue à chaque visite (il évolue au gré
// des seeds). Pas de cache statique.
export const dynamic = 'force-dynamic'

export type Painting = {
  id: number
  title: string
  artist: string
  year: number
  movement_fr: string
  image_url: string
}

// Un mouvement n'est proposé dans le jeu que s'il a au moins ce nombre d'œuvres,
// sinon le joueur mémorise les tableaux par cœur (l'inverse du but pédagogique).
const MIN_PER_MOVEMENT = 10
// PostgREST plafonne une requête à 1000 lignes : on pagine pour tout récupérer.
const PAGE = 1000

export default async function PeinturesPage() {
  const supabase = await createClient()

  const all: Painting[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('paintings')
      .select('id, title, artist, year, movement_fr, image_url')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-[#0d0d0c] px-6 text-center">
          <p className="text-[#e8e2d0]">
            Impossible de charger le catalogue : {error.message}
          </p>
        </main>
      )
    }
    if (!data || data.length === 0) break
    all.push(...(data as Painting[]))
    if (data.length < PAGE) break
  }

  // Mouvements jouables (≥ MIN_PER_MOVEMENT œuvres).
  const counts = new Map<string, number>()
  for (const p of all) {
    counts.set(p.movement_fr, (counts.get(p.movement_fr) ?? 0) + 1)
  }
  const movements = [...counts.entries()]
    .filter(([, n]) => n >= MIN_PER_MOVEMENT)
    .map(([m]) => m)
    .sort((a, b) => a.localeCompare(b, 'fr'))

  const playable = new Set(movements)
  const paintings = all.filter(
    (p) => playable.has(p.movement_fr) && p.image_url
  )

  return <PaintingGame paintings={paintings} movements={movements} />
}
