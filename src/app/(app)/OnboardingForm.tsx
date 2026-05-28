'use client'

// Formulaire de création du foyer lors du premier accès
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingForm() {
  const router = useRouter()
  const [householdName, setHouseholdName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!householdName.trim()) return

    setLoading(true)
    setError(null)

    // Passer par l'API route (session lue côté serveur depuis les cookies)
    // pour garantir que auth.uid() est disponible lors de l'évaluation des politiques RLS.
    const response = await fetch('/api/households', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: householdName.trim() }),
    })

    const result = await response.json()

    if (!response.ok) {
      setError(`Erreur lors de la création du foyer : ${result.error}`)
      setLoading(false)
      return
    }

    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="householdName" className="block text-sm font-medium text-gray-700 mb-1">
          Nom du foyer
        </label>
        <input
          id="householdName"
          type="text"
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          required
          placeholder="Ex : Famille Martin"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !householdName.trim()}
        className="w-full bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Création...' : 'Créer mon foyer'}
      </button>
    </form>
  )
}
