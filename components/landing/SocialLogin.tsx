'use client'

import React, { useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SocialLogin() {
  const [email, setEmail]     = useState('')
  const [code, setCode]       = useState('')
  const [step, setStep]       = useState<'email' | 'code'>('email')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const router = useRouter()

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)

    const supabase = createSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })

    if (error) {
      setError(error.message)
    } else {
      setStep('code')
    }
    setLoading(false)
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code || code.length < 6) return
    setLoading(true)
    setError(null)

    const supabase = createSupabaseClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    if (error) {
      setError('Invalid code. Please try again.')
      setLoading(false)
    } else if (data.session) {
      router.replace('/dashboard')
    }
  }

  if (step === 'code') {
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col gap-4 px-4">
        <div className="text-center mb-2">
          <div className="text-3xl mb-2">📬</div>
          <p className="text-white font-semibold">Check your email</p>
          <p className="text-muted text-sm mt-1">
            We sent a login code to <span className="text-primary">{email}</span> — paste it below
          </p>
        </div>

        <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Enter your code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            maxLength={8}
            required
            autoFocus
            className="w-full px-4 py-4 rounded-xl bg-surface border border-white/10 text-white placeholder-muted/50 focus:outline-none focus:border-primary text-center text-2xl font-bold tracking-[0.5em]"
          />
          <button
            type="submit"
            disabled={loading || code.length < 6} // accepts 6-8 digits
            className="flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl font-semibold text-sm text-background transition-all disabled:opacity-60"
            style={{background: 'linear-gradient(135deg, #00E676, #00BFA5)'}}
          >
            {loading ? (
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : '✓ Verify Code'}
          </button>
        </form>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={() => { setStep('email'); setCode(''); setError(null) }}
          className="text-muted/60 text-xs underline hover:text-muted text-center"
        >
          ← Use a different email
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-4 px-4">
      <p className="text-center text-muted text-sm uppercase tracking-widest mb-2">Get started free</p>

      <form onSubmit={handleSendCode} className="flex flex-col gap-3">
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
          className="flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl font-semibold text-sm text-background transition-all disabled:opacity-60"
          style={{background: 'linear-gradient(135deg, #00E676, #00BFA5)'}}
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
          {loading ? 'Sending...' : 'Send Login Code'}
        </button>
      </form>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <p className="text-center text-muted/60 text-xs mt-2">
        We&apos;ll email you a 6-digit code — no password needed.
      </p>

      {process.env.NODE_ENV === 'development' && (
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-2 w-full px-6 py-2.5 rounded-xl font-semibold text-xs border border-dashed border-yellow-500/40 text-yellow-400/70 hover:border-yellow-400 hover:text-yellow-400 transition-all"
        >
          ⚡ Dev: Skip login → Dashboard
        </button>
      )}
    </div>
  )
}
