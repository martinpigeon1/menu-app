'use client'

import { useState } from 'react'
import { Recipe } from '@/types/database'
import { getMondayOf, toDateString, dayLabel } from '@/lib/weeks'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

interface AddToPlannerSheetProps {
  recipe: Recipe
  onClose: () => void
  onAdded: () => void
}

export default function AddToPlannerSheet({ recipe, onClose, onAdded }: AddToPlannerSheetProps) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [servings, setServings] = useState(recipe.default_servings ?? 4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    setLoading(true)
    setError(null)

    try {
      const week = toDateString(getMondayOf())
      const planRes = await fetch(`/api/meal-plans/current?week=${week}`)
      const planData = await planRes.json()
      if (!planRes.ok) throw new Error(planData.error ?? 'Plan introuvable')

      const addRes = await fetch(`/api/meal-plans/${planData.id}/recipes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: recipe.id, servings, day_of_week: selectedDay }),
      })
      const addData = await addRes.json()
      if (!addRes.ok) throw new Error(addData.error ?? 'Erreur lors de l\'ajout')

      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-xl p-5 space-y-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Ajouter au planning</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <p className="text-sm text-gray-600 font-medium truncate">{recipe.name}</p>

        {/* Day selector */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Jour (cette semaine)</p>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS.map((label, i) => {
              const active = selectedDay === i
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(active ? null : i)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? 'bg-green-600 text-white border-green-600'
                      : 'border-gray-200 text-gray-600 hover:border-green-300'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {selectedDay === null && (
            <p className="text-xs text-amber-600">Sans jour — ne sera pas inclus dans la liste de courses</p>
          )}
        </div>

        {/* Servings */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Portions</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              disabled={servings <= 1}
              className="w-10 h-10 rounded-lg border border-gray-200 text-gray-700 text-xl font-medium flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              −
            </button>
            <span className="w-8 text-center font-semibold text-gray-900 text-lg">{servings}</span>
            <button
              onClick={() => setServings((s) => s + 1)}
              className="w-10 h-10 rounded-lg border border-gray-200 text-gray-700 text-xl font-medium flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <button
          onClick={handleAdd}
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Ajout…' : `Ajouter au planning${selectedDay !== null ? ` — ${dayLabel(selectedDay)}` : ''}`}
        </button>
      </div>
    </>
  )
}
