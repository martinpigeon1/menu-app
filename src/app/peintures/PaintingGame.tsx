'use client'

// Jeu « Devine le mouvement » — gameplay côté client.
// Partie chronométrée de 3 minutes, flux continu de tableaux. Pour chaque
// tableau : le mouvement (réponse instantanée — un mauvais choix fait passer
// au suivant), puis la décennie via deux roues (siècle + décennie) à inertie,
// et enfin l'artiste (facultatif, double les points). But : éduquer l'œil.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Leaderboard from './Leaderboard'
import type { Painting } from './page'

// ── Règles du jeu ───────────────────────────────────────────────────────────
const GAME_SECONDS = 180 // chrono global, en continu (pas de pause)
const FLASH_MS = 3500 // révélation laissée à l'écran pour avoir le temps d'apprendre
const MOVEMENT_POINTS = 100
const DECADE_EXACT = 100
const DECADE_ADJACENT = 50
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
type MovementResult = 'pending' | 'correct' | 'wrong'
type DecadeKind = 'exact' | 'adjacent' | 'miss'
type Flash = {
  won: boolean
  total: number
  decadeKind: DecadeKind
  artistDoubled: boolean
  streakAfter: number
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

  // File de tableaux mélangée une fois par partie.
  const [queue, setQueue] = useState<Painting[]>([])
  const [qi, setQi] = useState(0)
  const current = queue.length ? queue[qi % queue.length] : undefined

  // Réponses du tour courant.
  const [pickedMovement, setPickedMovement] = useState<string | null>(null)
  const [movementResult, setMovementResult] = useState<MovementResult>('pending')
  const [pickedCentury, setPickedCentury] = useState<number | null>(null)
  const [pickedDigit, setPickedDigit] = useState<number | null>(null)
  const [artistGuess, setArtistGuess] = useState('')
  const [imgBroken, setImgBroken] = useState(false)

  // Scores & séries.
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [seen, setSeen] = useState(0)
  const [flash, setFlash] = useState<Flash | null>(null)

  // Classement.
  const [showBoard, setShowBoard] = useState(false)
  const [pseudo, setPseudo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Chrono.
  const endRef = useRef<number>(0)
  const [remainingMs, setRemainingMs] = useState(GAME_SECONDS * 1000)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Bornes du catalogue → roue des siècles.
  const centuries = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const p of paintings) {
      if (p.year < min) min = p.year
      if (p.year > max) max = p.year
    }
    const cs: number[] = []
    for (let c = Math.floor(min / 100) * 100; c <= Math.floor(max / 100) * 100; c += 100) cs.push(c)
    return cs
  }, [paintings])
  const digits = useMemo(() => [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], [])

  const pickedDecade =
    pickedCentury !== null && pickedDigit !== null ? pickedCentury + pickedDigit : null

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

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [])

  function resetTurn() {
    setPickedMovement(null)
    setMovementResult('pending')
    setPickedCentury(null)
    setPickedDigit(null)
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

  const drawNext = useCallback(() => {
    setQi((i) => i + 1)
    resetTurn()
  }, [])

  function armFlash(f: Flash) {
    setFlash(f)
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null
      drawNext()
    }, FLASH_MS)
  }

  // Avance immédiatement (clic « Continuer » / sur le voile).
  function advanceNow() {
    if (!flash) return
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = null
    drawNext()
  }

  // Sélection d'un mouvement : retour instantané. Faux → on passe au suivant.
  function pickMovement(m: string) {
    if (!current || flash || movementResult !== 'pending') return
    setPickedMovement(m)
    if (m === current.movement_fr) {
      setMovementResult('correct') // on débloque les roues + artiste
      return
    }
    // Mauvais mouvement : 0 point, série cassée, on enchaîne.
    setMovementResult('wrong')
    setStreak(0)
    setSeen((n) => n + 1)
    armFlash({
      won: false,
      total: 0,
      decadeKind: 'miss',
      artistDoubled: false,
      streakAfter: 0,
      correctMovement: current.movement_fr,
      correctDecade: decadeOf(current.year),
      artist: current.artist,
      year: current.year,
      title: current.title,
    })
  }

  // Validation de la décennie (le mouvement est déjà confirmé correct).
  function validate() {
    if (!current || flash || movementResult !== 'correct') return
    if (pickedDecade === null) return

    const correctDecade = decadeOf(current.year)
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

    let base = MOVEMENT_POINTS + decadePts
    const artistFilled = artistGuess.trim().length > 0
    const artistDoubled = artistFilled && artistMatches(artistGuess, current.artist)
    if (artistDoubled) base *= 2

    // Mouvement correct → la série progresse et son bonus s'applique (après ×2).
    const total = Math.round(base * (1 + STREAK_STEP * streak))
    const newStreak = streak + 1

    setScore((s) => s + total)
    setStreak(newStreak)
    if (newStreak > bestStreak) setBestStreak(newStreak)
    setSeen((n) => n + 1)

    armFlash({
      won: true,
      total,
      decadeKind,
      artistDoubled,
      streakAfter: newStreak,
      correctMovement: current.movement_fr,
      correctDecade,
      artist: current.artist,
      year: current.year,
      title: current.title,
    })
  }

  function skip() {
    if (!current || flash) return
    setStreak(0)
    setSeen((n) => n + 1)
    drawNext()
  }

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
          <p className="text-[#a8a290] leading-relaxed mb-8">
            Un flux de tableaux pendant 3 minutes. Reconnais le{' '}
            <span className="text-[#e8e2d0]">mouvement</span>, situe la{' '}
            <span className="text-[#e8e2d0]">décennie</span>, et nomme
            l&apos;<span className="text-[#e8e2d0]">artiste</span> si tu peux.
            Apprends à voir, pas à mémoriser.
          </p>
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
          <p className="text-[#c9a84a] tracking-[0.3em] text-xs uppercase mb-3">
            Temps écoulé
          </p>
          <p key={score} className="pg-pop text-7xl font-serif text-[#f3ecd8] mb-6">
            {score}
          </p>
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

          {saved ? (
            <p className="text-emerald-300 text-sm mb-6">Score enregistré ✓</p>
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
          {saveError && <p className="text-red-300 text-xs mb-4">{saveError}</p>}

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
  const wheelsActive = movementResult === 'correct' && !flash
  const canValidate = wheelsActive && pickedDecade !== null
  const totalSec = Math.ceil(remainingMs / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = String(totalSec % 60).padStart(2, '0')
  const lowTime = remainingMs <= 30000
  const correctCentury = flash ? Math.floor(flash.year / 100) * 100 : null
  const correctDigit = flash ? decadeOf(flash.year) - Math.floor(flash.year / 100) * 100 : null

  return (
    <main className="min-h-screen w-full bg-[#0d0d0c] flex flex-col">
      {/* Barre supérieure : score · chrono · série */}
      <header className="shrink-0 grid grid-cols-3 items-center px-5 sm:px-8 py-3 border-b border-[#26241c]">
        <span
          key={score}
          className="pg-bump text-2xl sm:text-3xl font-bold text-[#c9a84a] justify-self-start tabular-nums"
        >
          {score}
        </span>
        <span
          className={`justify-self-center font-mono text-3xl sm:text-4xl tabular-nums ${
            lowTime ? 'text-red-400 animate-pulse' : 'text-[#f3ecd8]'
          }`}
        >
          {mm}:{ss}
        </span>
        <span
          key={streak}
          className={`justify-self-end ${streak > 0 ? 'pg-bump' : ''} inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm sm:text-base font-semibold ${
            streak > 1
              ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/40'
              : streak === 1
                ? 'bg-[#c9a84a]/15 text-[#c9a84a]'
                : 'text-[#5a5648]'
          }`}
        >
          {streak > 0 ? (
            <>
              <span className="text-base sm:text-lg">🔥</span>
              <span>série ×{streak}</span>
              {streak > 1 && (
                <span className="text-xs text-orange-200/80">
                  +{Math.round(STREAK_STEP * streak * 100)}%
                </span>
              )}
            </>
          ) : (
            <span>série 0</span>
          )}
        </span>
      </header>

      {/* Zone centrale paysage : mouvements · tableau · roues/artiste */}
      <div className="flex-1 min-h-0 grid lg:grid-cols-[230px_1fr_250px] gap-4 sm:gap-6 px-4 sm:px-8 py-5">
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
            } else if (movementResult === 'correct' && isPicked) {
              cls = 'border-emerald-500/70 text-emerald-300 bg-emerald-500/10'
            } else if (isPicked) {
              cls = 'border-[#c9a84a] text-[#f3ecd8] bg-[#c9a84a]/10'
            }
            return (
              <button
                key={m}
                disabled={movementResult !== 'pending' || !!flash}
                onClick={() => pickMovement(m)}
                className={`px-3 py-2 rounded border text-sm text-left transition-colors disabled:cursor-default ${cls}`}
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
        </div>

        {/* Roues décennie + artiste (droite) */}
        <div className="flex flex-col justify-center gap-4 order-3">
          <div>
            <p className="text-[#a8a290] text-xs uppercase tracking-widest mb-1">
              Décennie{' '}
              {!wheelsActive && !flash && (
                <span className="text-[#5a5648] normal-case tracking-normal">
                  · choisis d&apos;abord le mouvement
                </span>
              )}
            </p>
            <div className="flex gap-3 justify-center">
              <Wheel
                options={centuries}
                format={(v) => `${v}`}
                disabled={!wheelsActive}
                resetSignal={qi}
                correctValue={correctCentury}
                onChange={setPickedCentury}
              />
              <Wheel
                options={digits}
                format={(v) => `${v}`}
                disabled={!wheelsActive}
                resetSignal={qi}
                correctValue={correctDigit}
                onChange={setPickedDigit}
              />
            </div>
            <p className="text-center text-sm mt-1 text-[#a8a290]">
              {pickedDecade !== null ? `${pickedDecade}s` : '— · —'}
            </p>
          </div>

          <input
            value={artistGuess}
            disabled={!wheelsActive}
            onChange={(e) => setArtistGuess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canValidate) validate()
            }}
            placeholder="Artiste (facultatif)…"
            className="w-full px-3 py-2 rounded border border-[#3a362b] bg-[#13110d] text-[#e8e2d0] placeholder-[#5a5648] text-sm focus:border-[#c9a84a] focus:outline-none disabled:opacity-50"
          />
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

      {/* Révélation centrale (arcade) */}
      {flash && (
        <button
          onClick={advanceNow}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-6 cursor-pointer"
          aria-label="Continuer"
        >
          <div className="pg-reveal text-center max-w-md w-full bg-[#15130e] ring-1 ring-[#c9a84a]/40 rounded-2xl px-8 py-7 shadow-2xl">
            <p
              className={`text-sm tracking-[0.25em] uppercase mb-2 ${
                flash.won ? 'text-emerald-300' : 'text-red-300'
              }`}
            >
              {flash.won ? 'Bien vu' : 'Raté'}
            </p>
            <p
              key={flash.total}
              className={`pg-pop text-6xl font-bold mb-1 ${
                flash.total > 0 ? 'text-[#ffd76a]' : 'text-[#6f6a5c]'
              }`}
            >
              {flash.total > 0 ? `+${flash.total}` : '+0'}
            </p>
            {flash.artistDoubled && (
              <p className="text-emerald-300 text-sm mb-1">artiste trouvé · ×2</p>
            )}
            {flash.won && flash.streakAfter > 1 && (
              <p className="text-[#c9a84a] text-sm mb-1">🔥 série de {flash.streakAfter}</p>
            )}
            <p className="text-[#f3ecd8] font-serif text-xl mt-3">« {flash.title} »</p>
            <p className="text-[#cfc9b6]">{flash.artist}</p>
            <p className="text-[#c9a84a] mt-2 text-lg">
              {flash.correctMovement} · {flash.correctDecade}s
            </p>
            <p className="text-[#5a5648] text-xs mt-4">Continuer →</p>
          </div>
        </button>
      )}
    </main>
  )
}

// ── Roue à inertie (picker vertical) ────────────────────────────────────────
// Pilotée par un offset (px) : vraie inertie au lâcher (fling + friction),
// cohérente sur souris/molette/tactile. Index 0 = placeholder « — ».
const ITEM_H = 40
const VISIBLE = 5
const FRICTION = 0.94
const MIN_V = 0.015

function Wheel({
  options,
  format,
  disabled,
  resetSignal,
  correctValue,
  onChange,
}: {
  options: number[]
  format: (v: number) => string
  disabled: boolean
  resetSignal: number
  correctValue: number | null
  onChange: (v: number | null) => void
}) {
  const containerH = ITEM_H * VISIBLE
  const pad = (containerH - ITEM_H) / 2
  const items = useMemo(() => [null as number | null, ...options], [options])
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
    const target = Math.max(0, Math.min(maxOffset, Math.round(offsetRef.current / ITEM_H) * ITEM_H))
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
      if (dt > 0) v = -(b.y - a.y) / dt
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
    <div className="relative select-none w-20" style={{ height: containerH }}>
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
        className={`h-full overflow-hidden rounded ${
          disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ touchAction: 'none' }}
      >
        <div style={{ transform: `translateY(${pad - offset}px)` }}>
          {items.map((d, i) => {
            const isCentered = i === centeredIdx
            const isCorrect = correctValue !== null && d === correctValue
            const isWrongPick = correctValue !== null && isCentered && d !== correctValue
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
                {d === null ? '—' : format(d)}
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
