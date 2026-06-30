'use client'

// Classement du jeu « Devine le mouvement ».
// Deux vues : « Tous les temps » (top 10 par score) et « Cette semaine »
// (top 10 filtré sur le début de la semaine en cours). Lecture publique via
// la clé anon (RLS « Public read »).
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type LeaderboardRow = {
  id: number
  pseudo: string
  score: number
  best_streak: number
  paintings_seen: number
  created_at: string
}

type Tab = 'all' | 'week'

// Début de la semaine en cours (lundi 00:00, heure locale).
function startOfWeek(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7 // 0 = lundi
  d.setDate(d.getDate() - day)
  return d
}

// Date relative en français, sans dépendance (Intl.RelativeTimeFormat).
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = then - Date.now()
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
  const sec = Math.round(diff / 1000)
  const min = Math.round(sec / 60)
  const hour = Math.round(min / 60)
  const day = Math.round(hour / 24)
  if (Math.abs(sec) < 60) return rtf.format(sec, 'second')
  if (Math.abs(min) < 60) return rtf.format(min, 'minute')
  if (Math.abs(hour) < 24) return rtf.format(hour, 'hour')
  if (Math.abs(day) < 30) return rtf.format(day, 'day')
  return rtf.format(Math.round(day / 30), 'month')
}

export default function Leaderboard({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('all')
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (which: Tab) => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    let query = supabase
      .from('leaderboard')
      .select('id, pseudo, score, best_streak, paintings_seen, created_at')
      .order('score', { ascending: false })
      .limit(10)
    if (which === 'week') {
      query = query.gte('created_at', startOfWeek().toISOString())
    }
    const { data, error } = await query
    if (error) setError(error.message || 'Erreur de chargement')
    else setRows((data as LeaderboardRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load(tab)
  }, [tab, load])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-[#13110d] rounded-lg ring-1 ring-[#c9a84a]/30 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-serif text-[#f3ecd8]">Classement</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-[#6f6a5c] hover:text-[#e8e2d0] text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Onglets */}
        <div className="flex gap-2 mb-4">
          {(
            [
              ['all', 'Tous les temps'],
              ['week', 'Cette semaine'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 px-3 py-2 rounded text-sm transition-colors ${
                tab === key
                  ? 'bg-[#c9a84a] text-[#1a1813] font-medium'
                  : 'border border-[#3a362b] text-[#a8a290] hover:border-[#6f6a5c]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div className="min-h-[260px]">
          {loading ? (
            <p className="text-[#6f6a5c] text-sm text-center py-10">Chargement…</p>
          ) : error ? (
            <p className="text-red-300 text-sm text-center py-10">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-[#6f6a5c] text-sm text-center py-10">
              Aucun score{tab === 'week' ? ' cette semaine' : ''} pour l&apos;instant.
            </p>
          ) : (
            <ol className="space-y-1">
              {rows.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2 rounded odd:bg-[#1b1812]"
                >
                  <span
                    className={`w-6 text-right font-mono text-sm ${
                      i === 0
                        ? 'text-[#c9a84a]'
                        : i < 3
                          ? 'text-[#e8e2d0]'
                          : 'text-[#6f6a5c]'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-[#e8e2d0] text-sm">
                    {r.pseudo}
                  </span>
                  <span className="text-[#f3ecd8] font-mono text-sm tabular-nums">
                    {r.score}
                  </span>
                  <span className="text-[#6f6a5c] text-xs w-24 text-right">
                    {relativeDate(r.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
