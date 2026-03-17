'use client'

import React, { useState, useEffect } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import UploadTab from '@/components/dashboard/UploadTab'
import ClipsGallery from '@/components/dashboard/ClipsGallery'
import SettingsTab from '@/components/dashboard/SettingsTab'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

type Tab = 'upload' | 'clips' | 'settings'

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>('upload')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createSupabaseClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
      }
      // In dev mode, allow access without a session
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
      } else if (session) {
        setUser(session.user)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, router])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
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

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'upload', label: 'Upload', icon: '⬆️' },
    { id: 'clips', label: 'Clips', icon: '🎬' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full px-6 py-4 flex items-center justify-between border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <a href="/" className="text-xl font-black text-gradient tracking-tight">✂️ Slicer</a>
          <span className="text-xs text-muted ml-2 border border-primary/30 rounded-full px-2 py-0.5">by MCV</span>
        </div>
        <div className="flex items-center gap-4">
          {user?.user_metadata?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.user_metadata.avatar_url}
              alt="Avatar"
              className="w-8 h-8 rounded-full border border-primary/50"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-sm">
              🐱
            </div>
          )}
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
              onClick={() => setTab(t.id)}
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
          <UploadTab onJobCreated={() => setTab('clips')} />
        )}
        {tab === 'clips' && <ClipsGallery key={tab} onUploadNew={() => setTab('upload')} />}
        {tab === 'settings' && <SettingsTab user={user} />}
      </main>
    </div>
  )
}
