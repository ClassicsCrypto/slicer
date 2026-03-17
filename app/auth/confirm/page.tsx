'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

export default function AuthConfirm() {
  const router = useRouter()
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    const supabase = createSupabaseClient()

    const handleAuth = async () => {
      // Get hash params from URL (Supabase puts tokens in hash)
      const hash = window.location.hash
      const params = new URLSearchParams(hash.replace('#', ''))

      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      const token_hash = new URLSearchParams(window.location.search).get('token_hash')
      const type = new URLSearchParams(window.location.search).get('type')

      try {
        if (access_token && refresh_token) {
          // Hash-based flow (older Supabase)
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!error) {
            router.replace('/dashboard')
            return
          }
        }

        if (token_hash && type) {
          // PKCE flow
          const { error } = await supabase.auth.verifyOtp({
            token_hash,
            type: type as 'email' | 'recovery' | 'invite' | 'email_change',
          })
          if (!error) {
            router.replace('/dashboard')
            return
          }
        }

        // Check if already signed in
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.replace('/dashboard')
          return
        }

        // Listen for auth state change triggered by URL processing
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            subscription.unsubscribe()
            router.replace('/dashboard')
          }
        })

        // Fallback timeout
        setTimeout(() => {
          router.replace('/?error=auth_failed')
        }, 8000)

      } catch (err) {
        console.error('Auth confirm error:', err)
        router.replace('/')
      }
    }

    handleAuth()
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-10 h-10 text-primary mx-auto mb-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-white font-semibold mb-1">Signing you in...</p>
        <p className="text-muted text-sm">This will only take a moment</p>
      </div>
    </div>
  )
}
