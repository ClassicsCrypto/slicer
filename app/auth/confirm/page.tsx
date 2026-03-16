'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase'

export default function AuthConfirm() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createSupabaseClient()

    // Supabase automatically processes the hash token on getSession()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard')
      } else {
        // Listen for the auth state change triggered by hash processing
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            subscription.unsubscribe()
            router.replace('/dashboard')
          }
        })
        // Timeout fallback
        setTimeout(() => router.replace('/'), 5000)
      }
    })
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <svg className="animate-spin w-10 h-10 text-primary mx-auto mb-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        <p className="text-muted text-sm">Signing you in...</p>
      </div>
    </div>
  )
}
