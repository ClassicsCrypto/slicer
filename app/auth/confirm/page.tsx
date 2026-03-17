'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export default function AuthConfirm() {
  const router = useRouter()
  const done = useRef(false)
  const [status, setStatus] = useState('Verifying your link...')

  useEffect(() => {
    if (done.current) return
    done.current = true

    // Use a fresh client with explicit storage
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          storageKey: 'slicer-auth',
          storage: typeof window !== 'undefined' ? window.localStorage : undefined,
          flowType: 'implicit',
        }
      }
    )

    const run = async () => {
      // Parse all possible token locations
      const hashStr = window.location.hash.replace('#', '')
      const hashParams = new URLSearchParams(hashStr)
      const queryParams = new URLSearchParams(window.location.search)

      const access_token  = hashParams.get('access_token')
      const refresh_token = hashParams.get('refresh_token')
      const token_hash    = queryParams.get('token_hash')
      const type          = queryParams.get('type') || 'email'
      const error_desc    = hashParams.get('error_description') || queryParams.get('error_description')

      console.log('Auth confirm params:', { access_token: !!access_token, refresh_token: !!refresh_token, token_hash: !!token_hash, type, error_desc })

      if (error_desc) {
        setStatus('Link expired. Please request a new one.')
        setTimeout(() => router.replace('/'), 3000)
        return
      }

      // Method 1: Direct session from hash tokens
      if (access_token && refresh_token) {
        setStatus('Setting session...')
        const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (!error && data.session) {
          setStatus('Signed in! Redirecting...')
          setTimeout(() => router.replace('/dashboard'), 500)
          return
        }
        console.error('setSession error:', error?.message)
      }

      // Method 2: OTP verification
      if (token_hash) {
        setStatus('Verifying token...')
        const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: type as 'email' })
        if (!error && data.session) {
          setStatus('Signed in! Redirecting...')
          setTimeout(() => router.replace('/dashboard'), 500)
          return
        }
        console.error('verifyOtp error:', error?.message)
      }

      // Method 3: Supabase auto-detects from URL
      setStatus('Checking session...')
      await new Promise(r => setTimeout(r, 1500))
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setStatus('Signed in! Redirecting...')
        setTimeout(() => router.replace('/dashboard'), 500)
        return
      }

      // Method 4: Wait for auth state change
      setStatus('Waiting for verification...')
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth event:', event, !!session)
        if (session) {
          subscription.unsubscribe()
          setStatus('Signed in! Redirecting...')
          router.replace('/dashboard')
        }
      })

      // Final timeout
      setTimeout(() => {
        subscription.unsubscribe()
        setStatus('Link may have expired. Redirecting...')
        setTimeout(() => router.replace('/'), 2000)
      }, 10000)
    }

    run().catch(err => {
      console.error('Auth confirm fatal:', err)
      setStatus('Something went wrong. Redirecting...')
      setTimeout(() => router.replace('/'), 2000)
    })
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <svg className="animate-spin w-10 h-10 text-primary mx-auto mb-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-white font-semibold mb-1">{status}</p>
        <p className="text-muted text-xs mt-2">Do not close this tab</p>
      </div>
    </div>
  )
}
