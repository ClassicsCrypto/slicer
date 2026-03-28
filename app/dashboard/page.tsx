'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import UploadTab from '@/components/dashboard/UploadTab'
import ClipsGallery from '@/components/dashboard/ClipsGallery'
import SettingsTab from '@/components/dashboard/SettingsTab'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type Tab = 'upload' | 'clips' | 'settings'

const WELCOME_MESSAGES = [
  "Ready to go viral?",
  "Let's make some clips 🔥",
  "Your content, amplified.",
  "Time to slice something up ✂️",
  "The algorithm won't know what hit it.",
  "Drop a video. Watch magic happen.",
  "Clip it. Post it. Win.",
  "What are we clipping today?",
]

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('upload')
  const [clipsKey, setClipsKey] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createSupabaseClient()

  // Pick a random welcome message once per session
  const welcomeMsg = useMemo(() =>
    WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)],
  [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        setLoading(false)
      } else if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
        // Auto sign-in anonymously — persistent userId, no login screen
        try {
          const { data } = await supabase.auth.signInAnonymously()
          if (data?.user) setUser(data.user)
        } catch (e) {
          console.error('[dashboard] anon sign-in failed:', e)
        }
        setLoading(false)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setUser(null)
      else if (session) setUser(session.user)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut({ scope: 'global' })
    // Clear all local storage to ensure full logout
    if (typeof window !== 'undefined') {
      localStorage.clear()
      sessionStorage.clear()
    }
    router.push('/')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <svg className="animate-spin w-10 h-10 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || 'there'

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'upload', label: 'Upload', icon: '⬆️' },
    { id: 'clips', label: 'Clips', icon: '🎬' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full px-6 py-3 flex items-center justify-between border-b border-white/5 bg-background/80 backdrop-blur-md">
        {/* Logo — navigate to landing WITHOUT signing out */}
        <div className="flex items-center gap-2">
          <a
            href="/"
            className="text-xl font-black tracking-tight hover:opacity-80 transition-opacity"
            style={{background:'linear-gradient(90deg,#00E676,#00BFA5)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}
          >
            ✂️ Slicer
          </a>
          <span className="text-xs text-muted ml-1 border border-primary/30 rounded-full px-2 py-0.5">by MCV</span>
        </div>

        {/* Welcome + user */}
        <div className="flex items-center gap-3">
          {/* Clickable name → Settings tab */}
          <button
            onClick={() => setTab('settings')}
            className="hidden sm:flex flex-col items-end hover:opacity-80 transition-opacity group"
          >
            <span className="text-xs text-muted leading-none mb-0.5 group-hover:text-primary transition-colors">{welcomeMsg}</span>
            <span className="text-sm font-semibold text-white leading-none group-hover:text-primary transition-colors">
              Hey, {displayName} 👋
            </span>
          </button>
          {/* Avatar — also goes to settings */}
          <button onClick={() => setTab('settings')} className="hover:opacity-80 transition-opacity">
            {user?.user_metadata?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-9 h-9 rounded-full border-2 border-primary/50"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/20 border-2 border-primary/50 flex items-center justify-center text-sm font-bold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </button>
          <button
            onClick={handleSignOut}
            className="text-sm text-muted hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="w-full border-b border-white/5 px-6">
        <div className="flex gap-0 max-w-4xl mx-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setClipsKey(k => k + 1) }}
              className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold transition-all border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-white hover:border-white/20'
              }`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full">
        {tab === 'upload' && (
          <UploadTab onJobCreated={() => { setClipsKey(k => k + 1); setTab('clips') }} />
        )}
        {tab === 'clips' && <ClipsGallery key={clipsKey} onUploadNew={() => setTab('upload')} />}
        {tab === 'settings' && <SettingsTab user={user} onSaved={() => {}} />}
      </main>
    </div>
  )
}
