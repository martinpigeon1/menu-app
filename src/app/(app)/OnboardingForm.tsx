'use client'

// Formulaire de création du foyer lors du premier accès
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface OnboardingFormProps {
  userId: string
}

export default function OnboardingForm({ userId }: OnboardingFormProps) {
  const router = useRouter()
  const [householdName, setHouseholdName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!householdName.trim()) return

    setLoading(true)
    setError(null)

    const supabase = createClient()

    // Créer le household
    const { data: household, error: householdError } = await supabase
      .from('households')
      .insert({ name: householdName.trim() })
      .select()
      .single()

    if (householdError || !household) {
      setError(`Erreur lors de la création du foyer : ${householdError?.message ?? 'réponse vide'}`)
      setLoading(false)
      return
    }

    // Ajouter l'utilisateur comme admin
    const { error: memberError } = await supabase
      .from('household_members')
      .insert({
        household_id: household.id,
        user_id: userId,
        role: 'admin',
      })

    if (memberError) {
      setError(`Erreur lors de la configuration du foyer : ${memberError.message}`)
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
