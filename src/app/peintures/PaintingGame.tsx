'use client'

// Jeu « Devine le mouvement » — gameplay côté client.
// Partie chronométrée de 3 minutes, flux continu de tableaux. Pour chaque
// tableau le joueur devine : le mouvement (obligatoire), la décennie via une
// roue à défilement (obligatoire), et l'artiste (facultatif). Le but est
// d'éduquer l'œil à reconnaître style et époque, pas de mémoriser des titres.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Leaderboard from './Leaderboard'
import type { Painting } from './page'

// ── Règles du jeu ───────────────────────────────────────────────────────────
const GAME_SECONDS = 180 // chrono global, en continu (pas de pause)
const FLASH_MS = 1500 // durée de la révélation avant enchaînement auto
const MOVEMENT_POINTS = 100
const DECADE_EXACT = 50
const DECADE_ADJACENT = 25
const STREAK_STEP = 0.1 // +10 % par tableau de série déjà accumulé, non plafonné

// ── Utilitaires ─────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10
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

// Le joueur a « trouvé » l'artiste si sa saisie partage un mot significatif
// (typiquement le nom de famille) avec la réponse, ou la contient.
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
type DecadeKind = 'exact' | 'adjacent' | 'miss'
type Flash = {
  total: number
  movementCorrect: boolean
  decadeKind: DecadeKind
  artistDoubled: boolean
  correctMovement: string
  correctDecade: number
  artist: string
  year: number
  title: string
}

export default function PaintingGame({
  paintings,
  movements,
}: {
  paintings: Painting[]
  movements: string[]
}) {
  const [phase, setPhase] = useState<Phase>('intro')

  // File de tableaux mélangée une fois par partie (le catalogue est bien plus
  // grand que ce qu'on peut voir en 3 min : pas de répétition en pratique).
  const [queue, setQueue] = useState<Painting[]>([])
  const [qi, setQi] = useState(0)
  const current = queue.length ? queue[qi % queue.length] : undefined

  // Réponses du tour courant.
  const [pickedMovement, setPickedMovement] = useState<string | null>(null)
  const [pickedDecade, setPickedDecade] = useState<number | null>(null)
  const [artistGuess, setArtistGuess] = useState('')
  const [imgBroken, setImgBroken] = useState(false)

  // Scores & séries.
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0) // série de mouvements corrects consécutifs
  const [bestStreak, setBestStreak] = useState(0)
  const [seen, setSeen] = useState(0) // tableaux validés ou passés
  const [flash, setFlash] = useState<Flash | null>(null)

  // Classement.
  const [showBoard, setShowBoard] = useState(false)
  const [pseudo, setPseudo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Chrono : on mémorise l'instant de fin et on rafraîchit l'affichage.
  const endRef = useRef<number>(0)
  const [remainingMs, setRemainingMs] = useState(GAME_SECONDS * 1000)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Décennies disponibles, dérivées du catalogue (bornes réelles).
  const decades = useMemo(() => {
    if (!paintings.length) return []
    let min = Infinity
    let max = -Infinity
    for (const p of paintings) {
      if (p.year < min) min = p.year
      if (p.year > max) max = p.year
    }
    const out: number[] = []
    for (let d = decadeOf(min); d <= decadeOf(max); d += 10) out.push(d)
    return out
  }, [paintings])

  // Options de mouvement : bonne réponse + 5 distracteurs, par tableau.
  const movementOptions = useMemo(() => {
    if (!current) return []
    const others = movements.filter((m) => m !== current.movement_fr)
    return shuffle([current.movement_fr, ...shuffle(others).slice(0, 5)])
  }, [current, movements])

  const finish = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = null
    setFlash(null)
    setPhase('done')
  }, [])

  // Boucle du chrono.
  useEffect(() => {
    if (phase !== 'playing') return
    const tick = () => {
      const left = endRef.current - Date.now()
      setRemainingMs(left > 0 ? left : 0)
      if (left <= 0) finish()
    }
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [phase, finish])

  // Nettoyage du timer de flash.
  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  function resetTurn() {
    setPickedMovement(null)
    setPickedDecade(null)
    setArtistGuess('')
    setImgBroken(false)
    setFlash(null)
  }

  function start() {
    setQueue(shuffle(paintings))
    setQi(0)
    setScore(0)
    setStreak(0)
    setBestStreak(0)
    setSeen(0)
    setSaved(false)
    setSaveError(null)
    setPseudo('')
    resetTurn()
    endRef.current = Date.now() + GAME_SECONDS * 1000
    setRemainingMs(GAME_SECONDS * 1000)
    setPhase('playing')
  }

  // Passe au tableau suivant (sans toucher au score ni à la série).
  const drawNext = useCallback(() => {
    setQi((i) => i + 1)
    resetTurn()
  }, [])

  function validate() {
    if (!current || flash) return
    if (pickedMovement === null || pickedDecade === null) return

    const correctMovement = current.movement_fr
    const correctDecade = decadeOf(current.year)
    const movementCorrect = pickedMovement === correctMovement

    let decadeKind: DecadeKind = 'miss'
    let decadePts = 0
    const diff = Math.abs(pickedDecade - correctDecade)
    if (diff === 0) {
      decadeKind = 'exact'
      decadePts = DECADE_EXACT
    } else if (diff === 10) {
      decadeKind = 'adjacent'
      decadePts = DECADE_ADJACENT
    }

    let base = (movementCorrect ? MOVEMENT_POINTS : 0) + decadePts

    // Artiste rempli ET correct → double le score du tableau. Rempli mais
    // faux → aucune pénalité.
    const artistFilled = artistGuess.trim().length > 0
    const artistDoubled = artistFilled && artistMatches(artistGuess, current.artist)
    if (artistDoubled) base *= 2

    // Bonus de série : uniquement si le mouvement est correct (un mouvement
    // faux casse la série et ne reçoit aucun bonus). Calculé après le ×2.
    const streakMult = movementCorrect ? 1 + STREAK_STEP * streak : 1
    const total = Math.round(base * streakMult)

    setScore((s) => s + total)

    const newStreak = movementCorrect ? streak + 1 : 0
    setStreak(newStreak)
    if (newStreak > bestStreak) setBestStreak(newStreak)
    setSeen((n) => n + 1)

    setFlash({
      total,
      movementCorrect,
      decadeKind,
      artistDoubled,
      correctMovement,
      correctDecade,
      artist: current.artist,
      year: current.year,
      title: current.title,
    })

    flashTimer.current = setTimeout(() => {
      flashTimer.current = null
      drawNext()
    }, FLASH_MS)
  }

  function skip() {
    if (!current || flash) return
    // Passe sans aucun point ET casse la série, comme un mouvement faux.
    setStreak(0)
    setSeen((n) => n + 1)
    drawNext()
  }

  // Image cassée : on remplace silencieusement le tableau (incident technique,
  // ni point, ni pénalité, ni comptage).
  function onImgError() {
    setImgBroken(true)
    if (!flash) drawNext()
  }

  async function saveScore() {
    const name = pseudo.trim().slice(0, 20)
    if (!name || saving || saved) return
    setSaving(true)
    setSaveError(null)
    const supabase = createClient()
    const { error } = await supabase.from('leaderboard').insert({
      pseudo: name,
      score,
      best_streak: bestStreak,
      paintings_seen: seen,
    })
    setSaving(false)
    if (error) setSaveError(error.message || "Échec de l'enregistrement")
    else setSaved(true)
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
            Galerie · 3 minutes
          </p>
          <h1 className="text-4xl sm:text-5xl font-serif text-[#f3ecd8] mb-6">
            Devine le mouvement
          </h1>
          <p className="text-[#a8a290] leading-relaxed mb-6">
            Un flux continu de tableaux pendant 3 minutes. Pour chacun, choisis
            le <span className="text-[#e8e2d0]">mouvement</span>, fais défiler la
            roue jusqu&apos;à la <span className="text-[#e8e2d0]">décennie</span>,
            et si tu peux nomme l&apos;
            <span className="text-[#e8e2d0]">artiste</span> (facultatif, il
            double tes points).
          </p>
          <ul className="text-[#6f6a5c] text-xs space-y-1 mb-8">
            <li>Mouvement +100 · décennie exacte +50 · décennie voisine +25</li>
            <li>Artiste correct ×2 · série de mouvements +10 % par cran</li>
            <li>{movements.length} mouvements en jeu · {paintings.length} œuvres</li>
          </ul>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={start}
              className="px-8 py-3 rounded-full bg-[#c9a84a] text-[#1a1813] font-medium hover:bg-[#dcbb5a] transition-colors"
            >
              Commencer
            </button>
            <button
              onClick={() => setShowBoard(true)}
              className="px-6 py-3 rounded-full border border-[#3a362b] text-[#a8a290] hover:text-[#e8e2d0] hover:border-[#6f6a5c] transition-colors"
            >
              Classement
            </button>
          </div>
        </div>
        {showBoard && <Leaderboard onClose={() => setShowBoard(false)} />}
      </Shell>
    )
  }

  // ── Écran de fin ───────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <Shell>
        <div className="text-center max-w-md">
          <p className="text-[#c9a84a] tracking-[0.3em] text-xs uppercase mb-4">
            Temps écoulé
          </p>
          <p className="text-6xl font-serif text-[#f3ecd8] mb-6">{score}</p>
          <div className="flex justify-center gap-8 text-sm mb-8">
            <div>
              <p className="text-[#f3ecd8] text-2xl">{seen}</p>
              <p className="text-[#6f6a5c]">tableaux vus</p>
            </div>
            <div>
              <p className="text-[#f3ecd8] text-2xl">🔥 {bestStreak}</p>
              <p className="text-[#6f6a5c]">meilleure série</p>
            </div>
          </div>

          {/* Enregistrement du score */}
          {saved ? (
            <p className="text-emerald-300 text-sm mb-6">
              Score enregistré ✓
            </p>
          ) : (
            <div className="flex items-center gap-2 mb-3 max-w-xs mx-auto">
              <input
                value={pseudo}
                maxLength={20}
                onChange={(e) => setPseudo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveScore()
                }}
                placeholder="Ton pseudo…"
                className="flex-1 min-w-0 px-3 py-2 rounded border border-[#3a362b] bg-[#13110d] text-[#e8e2d0] placeholder-[#5a5648] text-sm focus:border-[#c9a84a] focus:outline-none"
              />
              <button
                onClick={saveScore}
                disabled={!pseudo.trim() || saving}
                className="shrink-0 px-4 py-2 rounded bg-[#c9a84a] text-[#1a1813] text-sm font-medium hover:bg-[#dcbb5a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          )}
          {saveError && (
            <p className="text-red-300 text-xs mb-4">{saveError}</p>
          )}

          <div className="flex items-center justify-center gap-3 mt-2">
            <button
              onClick={start}
              className="px-8 py-3 rounded-full bg-[#c9a84a] text-[#1a1813] font-medium hover:bg-[#dcbb5a] transition-colors"
            >
              Rejouer
            </button>
            <button
              onClick={() => setShowBoard(true)}
              className="px-6 py-3 rounded-full border border-[#3a362b] text-[#a8a290] hover:text-[#e8e2d0] hover:border-[#6f6a5c] transition-colors"
            >
              Classement
            </button>
          </div>
        </div>
        {showBoard && <Leaderboard onClose={() => setShowBoard(false)} />}
      </Shell>
    )
  }

  // ── Écran de jeu ───────────────────────────────────────────────────────
  if (!current) return null
  const canValidate = pickedMovement !== null && pickedDecade !== null && !flash
  const totalSec = Math.ceil(remainingMs / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = String(totalSec % 60).padStart(2, '0')
  const lowTime = remainingMs <= 30000

  return (
    <main className="min-h-screen w-full bg-[#0d0d0c] flex flex-col">
      {/* Barre supérieure : score · chrono · série */}
      <header className="shrink-0 grid grid-cols-3 items-center px-5 sm:px-8 py-3 border-b border-[#26241c]">
        <span className="text-[#c9a84a] text-sm sm:text-base justify-self-start">
          {score} pts
        </span>
        <span
          className={`justify-self-center font-mono text-3xl sm:text-4xl tabular-nums ${
            lowTime ? 'text-red-400 animate-pulse' : 'text-[#f3ecd8]'
          }`}
        >
          {mm}:{ss}
        </span>
        <span className="justify-self-end text-sm sm:text-base text-[#a8a290]">
          {streak > 0 ? `🔥 série de ${streak}` : '—'}
        </span>
      </header>

      {/* Zone centrale paysage : mouvements · tableau · décennie/artiste */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[230px_1fr_230px] gap-4 sm:gap-6 px-4 sm:px-8 py-5">
        {/* Mouvements (gauche) */}
        <div className="flex flex-col justify-center gap-2 order-2 lg:order-1">
          <p className="text-[#a8a290] text-xs uppercase tracking-widest mb-1">
            Mouvement
          </p>
          {movementOptions.map((m) => {
            const isPicked = pickedMovement === m
            const isAnswer = m === current.movement_fr
            let cls = 'border-[#3a362b] text-[#cfc9b6] hover:border-[#c9a84a]/60'
            if (flash) {
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
                disabled={!!flash}
                onClick={() => setPickedMovement(m)}
                className={`px-3 py-2 rounded border text-sm text-left transition-colors ${cls}`}
              >
                {m}
              </button>
            )
          })}
        </div>

        {/* Tableau (centre) */}
        <div className="relative flex items-center justify-center min-h-0 order-1 lg:order-2">
          <div
            className="absolute inset-0 -m-6 rounded-full opacity-40 blur-3xl pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(201,168,74,0.22), transparent 70%)',
            }}
          />
          <div className="relative p-2 sm:p-3 bg-gradient-to-b from-[#2a261d] to-[#171511] rounded-sm shadow-2xl ring-1 ring-[#c9a84a]/30 max-h-full">
            {imgBroken ? (
              <div className="w-[min(60vw,420px)] aspect-[3/4] flex items-center justify-center bg-[#0d0d0c] text-[#6f6a5c] text-sm">
                Image indisponible…
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.image_url}
                alt="Tableau à deviner"
                onError={onImgError}
                className="block max-h-[58vh] w-auto max-w-full object-contain"
              />
            )}
          </div>

          {/* Flash de révélation */}
          {flash && (
            <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
              <div className="rounded-md bg-[#13110d]/95 ring-1 ring-[#c9a84a]/30 px-4 py-2 text-center">
                <p className="text-[#c9a84a] text-lg font-medium">
                  +{flash.total}
                  {flash.artistDoubled && (
                    <span className="text-emerald-300 text-sm"> ×2 artiste</span>
                  )}
                </p>
                <p className="text-[#e8e2d0] text-sm font-serif">
                  « {flash.title} » — {flash.artist}, {flash.year}
                </p>
                <p className="text-[#6f6a5c] text-xs">
                  {flash.correctMovement} ·{' '}
                  {flash.decadeKind === 'exact'
                    ? 'décennie exacte'
                    : flash.decadeKind === 'adjacent'
                      ? `voisine (${flash.correctDecade}s)`
                      : `c'était ${flash.correctDecade}s`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Décennie + artiste (droite) */}
        <div className="flex flex-col justify-center gap-4 order-3">
          <div>
            <p className="text-[#a8a290] text-xs uppercase tracking-widest mb-1">
              Décennie
            </p>
            <DecadeWheel
              decades={decades}
              disabled={!!flash}
              resetSignal={qi}
              correctDecade={flash ? flash.correctDecade : null}
              onChange={setPickedDecade}
            />
          </div>

          <div>
            <input
              value={artistGuess}
              disabled={!!flash}
              onChange={(e) => setArtistGuess(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canValidate) validate()
              }}
              placeholder="Artiste (facultatif)…"
              className="w-full px-3 py-2 rounded border border-[#3a362b] bg-[#13110d] text-[#e8e2d0] placeholder-[#5a5648] text-sm focus:border-[#c9a84a] focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>
      </div>

      {/* Barre d'actions */}
      <footer className="shrink-0 flex items-center justify-center gap-3 px-5 py-4 border-t border-[#26241c]">
        <button
          onClick={skip}
          disabled={!!flash}
          className="px-5 py-2.5 rounded-full border border-[#3a362b] text-[#a8a290] text-sm hover:text-[#e8e2d0] hover:border-[#6f6a5c] transition-colors disabled:opacity-30"
        >
          Passer
        </button>
        <button
          onClick={validate}
          disabled={!canValidate}
          className="px-8 py-2.5 rounded-full bg-[#c9a84a] text-[#1a1813] font-medium hover:bg-[#dcbb5a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Valider
        </button>
      </footer>
    </main>
  )
}

// ── Roue de décennies (picker vertical avec inertie) ────────────────────────
// Pilotée par un offset (px) plutôt que par le scroll natif, pour offrir une
// vraie inertie au lâcher (fling avec friction) cohérente sur tous supports —
// utile vu les ~80 décennies à parcourir.
const ITEM_H = 40
const VISIBLE = 5 // nombre d'éléments visibles (impair pour avoir un centre)
const FRICTION = 0.94 // décroissance de vitesse par frame (~16 ms)
const MIN_V = 0.015 // seuil d'arrêt du fling (px/ms)

function DecadeWheel({
  decades,
  disabled,
  resetSignal,
  correctDecade,
  onChange,
}: {
  decades: number[]
  disabled: boolean
  resetSignal: number
  correctDecade: number | null
  onChange: (v: number | null) => void
}) {
  const containerH = ITEM_H * VISIBLE
  const pad = (containerH - ITEM_H) / 2
  // index 0 = placeholder « — » (aucune sélection), puis une entrée par décennie.
  const items = useMemo(() => [null as number | null, ...decades], [decades])
  const maxOffset = (items.length - 1) * ITEM_H

  const [offset, setOffsetState] = useState(0)
  const offsetRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<{ startY: number; startOffset: number; samples: { t: number; y: number }[] } | null>(null)
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setOff = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(maxOffset, v))
      offsetRef.current = clamped
      setOffsetState(clamped)
    },
    [maxOffset]
  )

  const report = useCallback(
    (o: number) => {
      const idx = Math.round(o / ITEM_H)
      onChange(idx <= 0 ? null : items[idx] ?? null)
    },
    [items, onChange]
  )

  const cancelAnim = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }, [])

  const snap = useCallback(() => {
    const target = Math.max(
      0,
      Math.min(maxOffset, Math.round(offsetRef.current / ITEM_H) * ITEM_H)
    )
    const animate = () => {
      const cur = offsetRef.current
      const diff = target - cur
      if (Math.abs(diff) < 0.5) {
        setOff(target)
        report(target)
        rafRef.current = null
        return
      }
      setOff(cur + diff * 0.25)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
  }, [maxOffset, report, setOff])

  const fling = useCallback(
    (v0: number) => {
      let v = v0
      let last = performance.now()
      const step = (now: number) => {
        const dt = now - last
        last = now
        v *= Math.pow(FRICTION, dt / 16)
        const next = offsetRef.current + v * dt
        if (Math.abs(v) < MIN_V || next <= 0 || next >= maxOffset) {
          setOff(next)
          snap()
          return
        }
        setOff(next)
        report(offsetRef.current)
        rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [maxOffset, report, setOff, snap]
  )

  // Réinitialise sur le placeholder à chaque nouveau tableau, et nettoyage.
  useEffect(() => {
    cancelAnim()
    setOff(0)
    onChange(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal])
  useEffect(() => () => cancelAnim(), [cancelAnim])

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return
    cancelAnim()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragRef.current = {
      startY: e.clientY,
      startOffset: offsetRef.current,
      samples: [{ t: performance.now(), y: e.clientY }],
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    setOff(d.startOffset - (e.clientY - d.startY))
    d.samples.push({ t: performance.now(), y: e.clientY })
    if (d.samples.length > 5) d.samples.shift()
    report(offsetRef.current)
  }
  function onPointerUp() {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    const s = d.samples
    let v = 0
    if (s.length >= 2) {
      const a = s[0]
      const b = s[s.length - 1]
      const dt = b.t - a.t
      if (dt > 0) v = -(b.y - a.y) / dt // glisser vers le haut => offset croissant
    }
    if (Math.abs(v) > 0.05) fling(v)
    else snap()
  }
  function onWheel(e: React.WheelEvent) {
    if (disabled) return
    cancelAnim()
    setOff(offsetRef.current + e.deltaY)
    report(offsetRef.current)
    if (wheelTimer.current) clearTimeout(wheelTimer.current)
    wheelTimer.current = setTimeout(snap, 120)
  }

  const centeredIdx = Math.round(offset / ITEM_H)

  return (
    <div className="relative select-none" style={{ height: containerH }}>
      {/* Bandeau de sélection au centre */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 border-y border-[#c9a84a]/40 bg-[#c9a84a]/5"
        style={{ top: pad, height: ITEM_H }}
      />
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className={`h-full overflow-hidden ${
          disabled ? 'opacity-70' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ touchAction: 'none' }}
      >
        <div style={{ transform: `translateY(${pad - offset}px)` }}>
          {items.map((d, i) => {
            const isCentered = i === centeredIdx
            const isCorrect = correctDecade !== null && d === correctDecade
            const isWrongPick =
              correctDecade !== null && isCentered && d !== correctDecade
            let cls = 'text-[#5a5648]'
            if (isCorrect) cls = 'text-emerald-300'
            else if (isWrongPick) cls = 'text-red-300'
            else if (isCentered) cls = 'text-[#f3ecd8]'
            return (
              <div
                key={i}
                className={`flex items-center justify-center font-mono tabular-nums ${cls} ${
                  isCentered ? 'text-lg' : 'text-sm'
                }`}
                style={{ height: ITEM_H }}
              >
                {d === null ? '—' : `${d}s`}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Conteneur plein écran sombre, pour les écrans intro/fin.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full bg-[#0d0d0c] flex items-center justify-center px-5 py-10">
      {children}
    </main>
  )
}
