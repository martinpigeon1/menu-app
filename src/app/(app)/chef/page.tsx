'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChefMessage, Recipe } from '@/types/database'
import ChefRecipeChip from '@/components/ui/ChefRecipeChip'
import AddToPlannerSheet from '@/components/ui/AddToPlannerSheet'

const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function weekLabel(weekStart: string | null): string {
  if (!weekStart) return ''
  const d = new Date(`${weekStart}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `Semaine du ${d.getDate()} ${FR_MONTHS[d.getMonth()]}`
}

const CHIPS: { label: string; message: string }[] = [
  { label: '🥦 Végétarien', message: 'Propose-moi des plats végétariens.' },
  { label: '⏱ Rapide (<30min)', message: 'Je voudrais quelque chose de rapide, moins de 30 minutes.' },
  { label: '🐟 Poisson', message: 'Propose-moi des recettes de poisson.' },
  { label: "🌶️ Ce que j'ai au frigo", message: "Aide-moi à cuisiner avec ce que j'ai au frigo." },
  { label: '⭐ Mes favoris', message: 'Suggère-moi mes recettes les mieux notées.' },
  { label: '🗓️ Plan de la semaine', message: 'Aide-moi à planifier les repas de la semaine.' },
]

export default function ChefPage() {
  const [messages, setMessages] = useState<ChefMessage[]>([])
  const [recipeMap, setRecipeMap] = useState<Map<string, Recipe>>(new Map())
  const [recipeCount, setRecipeCount] = useState(0)
  const [week, setWeek] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plannerRecipe, setPlannerRecipe] = useState<Recipe | null>(null)
  const [plannerToast, setPlannerToast] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: recipes }, convRes] = await Promise.all([
        supabase.from('recipes').select('*'),
        fetch('/api/chef/conversation').then((r) => r.json()).catch(() => ({ messages: [] })),
      ])
      const map = new Map<string, Recipe>()
      for (const r of (recipes ?? []) as Recipe[]) map.set(r.id, r)
      setRecipeMap(map)
      setRecipeCount(map.size)
      setMessages(convRes.messages ?? [])
      setWeek(convRes.week_start ?? null)
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending) return
    setError(null)
    setInput('')

    const userMsg: ChefMessage = { role: 'user', content, timestamp: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setSending(true)

    try {
      const res = await fetch('/api/chef/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erreur du Chef.')
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply,
            timestamp: new Date().toISOString(),
            suggested_recipe_ids: data.suggested_recipe_ids,
          },
        ])
      }
    } catch {
      setError('Erreur réseau. Réessaie.')
    } finally {
      setSending(false)
    }
  }

  async function handleReset() {
    if (!confirm('Recommencer la conversation de cette semaine ?')) return
    setMessages([])
    setError(null)
    try {
      await fetch('/api/chef/conversation', { method: 'DELETE' })
    } catch {
      // ignore — local state already cleared
    }
  }

  function renderAssistant(content: string) {
    const parts = content.split(/(\[\[RECIPE:[^\]]+\]\])/g)
    return parts.map((part, i) => {
      const m = part.match(/^\[\[RECIPE:([^:\]]+):([^\]]*)\]\]$/)
      if (m) {
        return (
          <ChefRecipeChip
            key={i}
            recipe={recipeMap.get(m[1])}
            fallbackName={m[2]}
            onAdd={(r) => setPlannerRecipe(r)}
          />
        )
      }
      if (!part) return null
      return <span key={i} className="whitespace-pre-wrap">{part}</span>
    })
  }

  return (
    <>
      <div className="fixed inset-x-0 top-14 bottom-16 z-10 flex flex-col">
        <div className="max-w-2xl mx-auto w-full h-full flex flex-col bg-gray-50">
          {/* Sub-header */}
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
            <div>
              <h2 className="font-semibold text-gray-900 leading-tight">💬 Chef</h2>
              {week && <p className="text-[11px] text-gray-400 leading-tight">{weekLabel(week)}</p>}
            </div>
            <button
              onClick={handleReset}
              className="text-xs text-gray-500 hover:text-red-500 font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-red-50 transition-colors"
            >
              🗑 Recommencer
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {loading ? (
              <p className="text-center text-sm text-gray-400 py-8">Chargement…</p>
            ) : messages.length === 0 ? (
              <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 px-3.5 py-2.5 text-sm text-gray-700">
                👋 Bonjour ! Je connais vos {recipeCount} recette{recipeCount !== 1 ? 's' : ''} et votre
                historique. Dites-moi ce dont vous avez envie ce soir, ce que vous avez au frigo,
                ou vos contraintes de la semaine.
              </div>
            ) : (
              messages.map((msg, i) =>
                msg.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] bg-green-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[85%] bg-white text-gray-800 rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 px-3.5 py-2.5 text-sm">
                      {renderAssistant(msg.content)}
                    </div>
                  </div>
                )
              )
            )}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 bg-white rounded-2xl rounded-tl-sm shadow-sm border border-gray-100 px-3.5 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" />
                  </div>
                  <span className="text-xs text-gray-400">Chef réfléchit…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick chips */}
          <div className="bg-white border-t border-gray-100">
            <div className="flex gap-2 overflow-x-auto px-3 py-2 no-scrollbar">
              {CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  onClick={() => send(chip.message)}
                  disabled={sending}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {error && <p className="px-4 pb-1 text-xs text-red-500">{error}</p>}

            {/* Input bar */}
            <div className="flex items-center gap-2 px-3 pb-3 pt-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send(input) }}
                placeholder="Posez votre question..."
                className="flex-1 px-3.5 py-2.5 rounded-full border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={() => send(input)}
                disabled={sending || !input.trim()}
                className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full bg-green-600 text-white text-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>

      {plannerRecipe && (
        <AddToPlannerSheet
          recipe={plannerRecipe}
          onClose={() => setPlannerRecipe(null)}
          onAdded={() => {
            setPlannerRecipe(null)
            setPlannerToast(true)
            setTimeout(() => setPlannerToast(false), 2500)
          }}
        />
      )}

      {plannerToast && (
        <div className="fixed bottom-24 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg">
            ✅ Ajouté au planning
          </div>
        </div>
      )}
    </>
  )
}
