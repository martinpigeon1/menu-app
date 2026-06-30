'use client'

// Jeu « Devine le mouvement » — gameplay côté client.
// Pour chaque tableau, le joueur devine : le mouvement artistique, la période
// (bande de 25 ans), et l'artiste (saisie libre, optionnelle). 8 tableaux par
// partie, tirés au hasard. Le but est d'éduquer l'œil à reconnaître un
// mouvement et une époque, pas de mémoriser des titres.
import { useMemo, useState } from 'react'
import type { Painting } from './page'

const ROUND_SIZE = 8
const BAND = 25 // largeur d'une bande de période, en années

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}

function bandStart(year: number): number {
  return Math.floor(year / BAND) * BAND
}

function bandLabel(start: number): string {
  return `${start}–${start + BAND}`
}

// Normalise un nom d'artiste pour une comparaison tolérante :
// minuscules, sans accents, sans parenthèses ni dates.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Le joueur a « trouvé » l'artiste si sa saisie partage le nom de famille
// (dernier mot significatif) avec la réponse, ou la contient.
function artistMatches(guess: string, answer: string): boolean {
  const g = normalize(guess)
  if (g.length < 2) return false
  const a = normalize(answer)
  if (!a || a === 'artiste inconnu') return false
  if (a.includes(g) || g.includes(a)) return true
  const answerWords = a.split(' ').filter((w) => w.length > 2)
  const guessWords = g.split(' ').filter((w) => w.length > 2)
  return answerWords.some((w) => guessWords.includes(w))
}

type Phase = 'intro' | 'playing' | 'done'

export default function PaintingGame({
  paintings,
  movements,
}: {
  paintings: Painting[]
  movements: string[]
}) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [deck, setDeck] = useState<Painting[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)

  // Réponses du tour courant.
  const [pickedMovement, setPickedMovement] = useState<string | null>(null)
  const [pickedBand, setPickedBand] = useState<number | null>(null)
  const [artistGuess, setArtistGuess] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [imgBroken, setImgBroken] = useState(false)

  const current = deck[index]

  // Options de réponse, recalculées à chaque nouveau tableau.
  const options = useMemo(() => {
    if (!current) return null

    // Mouvement : la bonne réponse + 5 distracteurs.
    const others = movements.filter((m) => m !== current.movement_fr)
    const movementOptions = shuffle([
      current.movement_fr,
      ...sample(others, Math.min(5, others.length)),
    ])

    // Période : la bonne bande + 3 bandes voisines plausibles.
    const correctBand = bandStart(current.year)
    const offsets = shuffle([-100, -75, -50, -25, 25, 50, 75, 100])
    const bands = new Set<number>([correctBand])
    for (const o of offsets) {
      const b = correctBand + o
      if (b >= 1100 && b <= 2000) bands.add(b)
      if (bands.size >= 4) break
    }
    const bandOptions = shuffle([...bands])

    return { movementOptions, bandOptions, correctBand }
  }, [current, movements])

  function start() {
    setDeck(sample(paintings, Math.min(ROUND_SIZE, paintings.length)))
    setIndex(0)
    setScore(0)
    resetTurn()
    setPhase('playing')
  }

  function resetTurn() {
    setPickedMovement(null)
    setPickedBand(null)
    setArtistGuess('')
    setRevealed(false)
    setImgBroken(false)
  }

  function validate() {
    if (!current || !options) return
    let gained = 0
    if (pickedMovement === current.movement_fr) gained += 1
    if (pickedBand === options.correctBand) gained += 1
    if (artistMatches(artistGuess, current.artist)) gained += 1
    setScore((s) => s + gained)
    setRevealed(true)
  }

  function next() {
    if (index + 1 >= deck.length) {
      setPhase('done')
    } else {
      setIndex((i) => i + 1)
      resetTurn()
    }
  }

  // ── Données insuffisantes ──────────────────────────────────────────────
  if (paintings.length === 0) {
    return (
      <Shell>
        <p className="text-[#e8e2d0] text-center max-w-md">
          Le catalogue est vide pour l&apos;instant. Lance les scripts de seed
          puis recharge la page.
        </p>
      </Shell>
    )
  }

  // ── Écran d'accueil ────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <Shell>
        <div className="text-center max-w-lg">
          <p className="text-[#c9a84a] tracking-[0.3em] text-xs uppercase mb-4">
            Galerie
          </p>
          <h1 className="text-4xl sm:text-5xl font-serif text-[#f3ecd8] mb-6">
            Devine le mouvement
          </h1>
          <p className="text-[#a8a290] leading-relaxed mb-8">
            {ROUND_SIZE} tableaux tirés au hasard parmi {paintings.length}{' '}
            œuvres. Pour chacun, devine le{' '}
            <span className="text-[#e8e2d0]">mouvement</span>, la{' '}
            <span className="text-[#e8e2d0]">période</span> et,
            si tu peux, l&apos;<span className="text-[#e8e2d0]">artiste</span>.
            {' '}Apprends à reconnaître le style, pas à mémoriser les titres.
          </p>
          <p className="text-[#6f6a5c] text-xs mb-8">
            {movements.length} mouvements en jeu · de la Renaissance au XX
            <sup>e</sup> siècle
          </p>
          <button
            onClick={start}
            className="px-8 py-3 rounded-full bg-[#c9a84a] text-[#1a1813] font-medium hover:bg-[#dcbb5a] transition-colors"
          >
            Commencer
          </button>
        </div>
      </Shell>
    )
  }

  // ── Écran de fin ───────────────────────────────────────────────────────
  if (phase === 'done') {
    const max = deck.length * 3
    const pct = Math.round((score / max) * 100)
    return (
      <Shell>
        <div className="text-center max-w-md">
          <p className="text-[#c9a84a] tracking-[0.3em] text-xs uppercase mb-4">
            Partie terminée
          </p>
          <p className="text-6xl font-serif text-[#f3ecd8] mb-2">
            {score}
            <span className="text-2xl text-[#6f6a5c]"> / {max}</span>
          </p>
          <p className="text-[#a8a290] mb-8">
            {pct >= 80
              ? 'Œil de connaisseur.'
              : pct >= 50
                ? 'Bel œil — continue à affiner.'
                : 'L&apos;œil se forme tableau après tableau.'}
          </p>
          <button
            onClick={start}
            className="px-8 py-3 rounded-full bg-[#c9a84a] text-[#1a1813] font-medium hover:bg-[#dcbb5a] transition-colors"
          >
            Rejouer
          </button>
        </div>
      </Shell>
    )
  }

  // ── Écran de jeu ───────────────────────────────────────────────────────
  if (!current || !options) return null
  const movementCorrect = pickedMovement === current.movement_fr
  const bandCorrect = pickedBand === options.correctBand
  const artistCorrect = artistMatches(artistGuess, current.artist)

  return (
    <Shell>
      <div className="w-full max-w-5xl mx-auto grid lg:grid-cols-[1fr_380px] gap-8 items-center">
        {/* Le tableau, dans un cadre de galerie éclairé */}
        <div className="relative flex items-center justify-center">
          <div
            className="absolute inset-0 -m-10 rounded-full opacity-40 blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(201,168,74,0.25), transparent 70%)',
            }}
          />
          <div className="relative p-3 bg-gradient-to-b from-[#2a261d] to-[#171511] rounded-sm shadow-2xl ring-1 ring-[#c9a84a]/30">
            {imgBroken ? (
              <div className="w-[min(70vw,520px)] aspect-[3/4] flex items-center justify-center bg-[#0d0d0c] text-[#6f6a5c] text-sm px-6 text-center">
                Image indisponible — passe au suivant
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.image_url}
                alt={revealed ? current.title : 'Tableau à deviner'}
                onError={() => setImgBroken(true)}
                className="block max-h-[70vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
        </div>

        {/* Panneau de jeu */}
        <div className="space-y-6">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#6f6a5c] tracking-widest uppercase">
              Tableau {index + 1} / {deck.length}
            </span>
            <span className="text-[#c9a84a]">Score {score}</span>
          </div>

          {/* Mouvement */}
          <div>
            <p className="text-[#a8a290] text-sm mb-2">Mouvement</p>
            <div className="grid grid-cols-2 gap-2">
              {options.movementOptions.map((m) => {
                const isPicked = pickedMovement === m
                const isAnswer = m === current.movement_fr
                let cls =
                  'border-[#3a362b] text-[#cfc9b6] hover:border-[#c9a84a]/60'
                if (revealed) {
                  if (isAnswer)
                    cls = 'border-emerald-500/70 text-emerald-300 bg-emerald-500/10'
                  else if (isPicked)
                    cls = 'border-red-500/60 text-red-300 bg-red-500/10'
                  else cls = 'border-[#2a2820] text-[#6f6a5c]'
                } else if (isPicked) {
                  cls = 'border-[#c9a84a] text-[#f3ecd8] bg-[#c9a84a]/10'
                }
                return (
                  <button
                    key={m}
                    disabled={revealed}
                    onClick={() => setPickedMovement(m)}
                    className={`px-3 py-2 rounded border text-sm text-left transition-colors ${cls}`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Période */}
          <div>
            <p className="text-[#a8a290] text-sm mb-2">Période</p>
            <div className="grid grid-cols-2 gap-2">
              {options.bandOptions.map((b) => {
                const isPicked = pickedBand === b
                const isAnswer = b === options.correctBand
                let cls =
                  'border-[#3a362b] text-[#cfc9b6] hover:border-[#c9a84a]/60'
                if (revealed) {
                  if (isAnswer)
                    cls = 'border-emerald-500/70 text-emerald-300 bg-emerald-500/10'
                  else if (isPicked)
                    cls = 'border-red-500/60 text-red-300 bg-red-500/10'
                  else cls = 'border-[#2a2820] text-[#6f6a5c]'
                } else if (isPicked) {
                  cls = 'border-[#c9a84a] text-[#f3ecd8] bg-[#c9a84a]/10'
                }
                return (
                  <button
                    key={b}
                    disabled={revealed}
                    onClick={() => setPickedBand(b)}
                    className={`px-3 py-2 rounded border text-sm transition-colors ${cls}`}
                  >
                    {bandLabel(b)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Artiste */}
          <div>
            <p className="text-[#a8a290] text-sm mb-2">
              Artiste{' '}
              <span className="text-[#6f6a5c]">(optionnel)</span>
            </p>
            <input
              value={artistGuess}
              disabled={revealed}
              onChange={(e) => setArtistGuess(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !revealed && pickedMovement && pickedBand)
                  validate()
              }}
              placeholder="Nom de l'artiste…"
              className="w-full px-3 py-2 rounded border border-[#3a362b] bg-[#13110d] text-[#e8e2d0] placeholder-[#5a5648] focus:border-[#c9a84a] focus:outline-none disabled:opacity-60"
            />
          </div>

          {/* Révélation */}
          {revealed && (
            <div className="rounded border border-[#3a362b] bg-[#13110d] p-4 text-sm space-y-1">
              <p className="text-[#f3ecd8] font-serif text-base">
                « {current.title} »
              </p>
              <p className="text-[#a8a290]">
                {current.artist} · {current.year}
              </p>
              <p className="text-[#6f6a5c]">
                {current.movement_fr}
              </p>
              <p className="pt-2 text-[#c9a84a]">
                +{(movementCorrect ? 1 : 0) +
                  (bandCorrect ? 1 : 0) +
                  (artistCorrect ? 1 : 0)}{' '}
                point(s) · mouvement {movementCorrect ? '✓' : '✗'} · période{' '}
                {bandCorrect ? '✓' : '✗'} · artiste {artistCorrect ? '✓' : '✗'}
              </p>
            </div>
          )}

          {/* Actions */}
          {revealed ? (
            <button
              onClick={next}
              className="w-full px-6 py-3 rounded-full bg-[#c9a84a] text-[#1a1813] font-medium hover:bg-[#dcbb5a] transition-colors"
            >
              {index + 1 >= deck.length ? 'Voir le score' : 'Tableau suivant'}
            </button>
          ) : (
            <button
              onClick={validate}
              disabled={!pickedMovement || pickedBand === null}
              className="w-full px-6 py-3 rounded-full bg-[#c9a84a] text-[#1a1813] font-medium hover:bg-[#dcbb5a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Valider
            </button>
          )}
        </div>
      </div>
    </Shell>
  )
}

// Conteneur plein écran sombre, commun à tous les écrans.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full bg-[#0d0d0c] flex items-center justify-center px-5 py-10">
      {children}
    </main>
  )
}
