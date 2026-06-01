'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PicnicStatus {
  connected: boolean
  email?: string
}

export default function SettingsPage() {
  const [status, setStatus] = useState<PicnicStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 2FA step (shown inline after login reports requires_2fa)
  const [twoFAStep, setTwoFAStep] = useState(false)
  const [code, setCode] = useState('')

  async function fetchStatus() {
    setLoading(true)
    try {
      const res = await fetch('/api/picnic/status')
      const data = await res.json()
      setStatus(res.ok ? data : { connected: false })
    } catch {
      setStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/picnic/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Connexion échouée')
      } else if (data.requires_2fa) {
        // Keep email & password in state — needed to complete /verify-2fa.
        setTwoFAStep(true)
        setCode('')
      } else {
        setPassword('')
        setEmail('')
        await fetchStatus()
      }
    } catch {
      setError('Erreur réseau.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault()
    if (code.trim().length < 4) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/picnic/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Code incorrect, réessayez')
      } else {
        setPassword('')
        setEmail('')
        setCode('')
        setTwoFAStep(false)
        await fetchStatus()
      }
    } catch {
      setError('Erreur réseau.')
    } finally {
      setSubmitting(false)
    }
  }

  function cancelTwoFA() {
    setTwoFAStep(false)
    setCode('')
    setPassword('')
    setError(null)
  }

  async function handleDisconnect() {
    if (!confirm('Déconnecter Picnic ? Vos correspondances d\'ingrédients sont conservées.')) return
    setSubmitting(true)
    try {
      await fetch('/api/picnic/disconnect', { method: 'POST' })
      await fetchStatus()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm">← Retour</Link>
        <h2 className="font-bold text-gray-900">Paramètres</h2>
      </div>

      {/* Picnic section */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛒</span>
          <h3 className="font-semibold text-gray-900">Picnic</h3>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            Chargement…
          </div>
        ) : status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-green-800">✅ Picnic connecté</p>
                {status.email && <p className="text-xs text-green-700 truncate">{status.email}</p>}
              </div>
              <button
                onClick={handleDisconnect}
                disabled={submitting}
                className="shrink-0 text-sm px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-white transition-colors disabled:opacity-50"
              >
                Déconnecter
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Vous pouvez maintenant envoyer votre liste de courses directement vers votre panier Picnic.
            </p>
          </div>
        ) : twoFAStep ? (
          <form onSubmit={handleVerify2FA} className="space-y-3">
            <p className="text-sm text-gray-700 font-medium">
              📱 Un code SMS a été envoyé à votre téléphone Picnic
            </p>
            <p className="text-xs text-gray-500">
              Saisissez le code reçu pour finaliser la connexion.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code de vérification</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                placeholder="000000"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm tracking-[0.4em] text-center focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={submitting || code.trim().length < 4}
              className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Vérification…' : 'Vérifier'}
            </button>
            <button
              type="button"
              onClick={cancelTwoFA}
              className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Annuler
            </button>
          </form>
        ) : (
          <form onSubmit={handleConnect} className="space-y-3">
            <p className="text-sm text-gray-600">
              Connectez votre compte Picnic pour envoyer vos listes de courses dans votre panier.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Picnic</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                Votre mot de passe n&apos;est jamais stocké — seul un jeton de session Picnic est conservé.
              </p>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Connexion…' : 'Connecter Picnic'}
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
