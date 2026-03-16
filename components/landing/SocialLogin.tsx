'use client'

import React, { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'

export default function SocialLogin() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)

    const supabase = createSupabaseClient()
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/confirm`
        : '/auth/confirm'

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm mx-auto text-center px-4">
        <div className="text-4xl mb-4">📬</div>
        <h3 className="text-white font-bold text-lg mb-2">Check your inbox</h3>
        <p className="text-muted text-sm">
          We sent a magic link to <span className="text-primary font-medium">{email}</span>.
          Click it to sign in — no password needed.
        </p>
        <button
          onClick={() => { setSent(false); setEmail('') }}
          className="mt-6 text-muted/60 text-xs underline hover:text-muted"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-4 px-4">
      <p className="text-center text-muted text-sm uppercase tracking-widest mb-2">Get started free</p>

      <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3.5 rounded-xl bg-surface border border-white/10 text-white placeholder-muted/50 focus:outline-none focus:border-primary text-sm"
        />
        <button
          type="submit"
          disabled={loading || !email}
          className="flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl font-semibold text-sm bg-primary hover:bg-primary/90 text-background transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          )}
          {loading ? 'Sending...' : 'Send Magic Link'}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-sm text-center">{error}</p>
      )}

      <p className="text-center text-muted/60 text-xs mt-2">
        No password needed — we&apos;ll email you a secure sign-in link.
      </p>

      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="mt-2 w-full px-6 py-2.5 rounded-xl font-semibold text-xs border border-dashed border-yellow-500/40 text-yellow-400/70 hover:border-yellow-400 hover:text-yellow-400 transition-all"
        >
          ⚡ Dev: Skip login → Dashboard
        </button>
      )}
    </div>
  )
}
