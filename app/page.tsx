'use client'

import React, { useEffect, useState } from 'react'
import FeatureMarquee from '@/components/landing/FeatureMarquee'
import SocialLogin from '@/components/landing/SocialLogin'
import { createSupabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export default function LandingPage() {
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createSupabaseClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser(session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || null

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-white/5 sticky top-0 z-40 bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight" style={{background:'linear-gradient(90deg,#00E676,#00BFA5)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>✂️ Slicer</span>
          <span className="text-xs text-muted font-medium ml-2 border border-primary/30 rounded-full px-2 py-0.5">by MCV</span>
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted hidden sm:block">Welcome back, <span className="text-white font-semibold">{displayName}</span></span>
            <a href="/dashboard" className="px-4 py-2 rounded-xl text-sm font-bold text-background transition-all hover:scale-105" style={{background:'linear-gradient(135deg,#00E676,#00BFA5)'}}>
              Go to Dashboard →
            </a>
          </div>
        ) : (
          <a href="#login" className="text-sm font-semibold text-primary hover:text-accent transition-colors">Sign in →</a>
        )}
      </header>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center text-center px-4 pt-20 pb-12 overflow-hidden">
        {/* Big green glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-30 pointer-events-none" style={{background:'radial-gradient(ellipse at center, #00E676 0%, transparent 70%)', filter:'blur(80px)'}} />

        {/* New logo cat */}
        <div className="mb-8 relative z-10" style={{filter:'drop-shadow(0 0 40px rgba(0,230,118,0.7))'}}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/slicer-logo.png"
            alt="Slicer"
            width={160}
            height={160}
            className="rounded-3xl"
            style={{animation:'float 3s ease-in-out infinite'}}
          />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-green-400/30 bg-green-400/5 mb-6">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-400 text-xs font-semibold tracking-widest uppercase">Now Live — Free for MCV Community</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-[1.05]">
            <span style={{background:'linear-gradient(135deg,#00E676 0%,#00BFA5 50%,#00E676 100%)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Turn Any Video</span>
            <br />
            <span className="text-white">Into Viral Clips.</span>
          </h1>

          <p className="text-gray-300 text-xl md:text-2xl max-w-2xl mx-auto mb-4 leading-relaxed">
            Drop a video. Slicer&apos;s AI finds the best moments, cuts them perfectly, and adds subtitles — ready to post on TikTok, X, YouTube Shorts, and more.
          </p>
          <p className="text-green-400 text-sm font-semibold tracking-widest uppercase mb-12">No editing skills needed. No timeline. No BS.</p>

          {user ? (
            <a href="/dashboard" className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg text-background transition-all hover:scale-105 active:scale-95 shadow-lg" style={{background:'linear-gradient(135deg,#00E676,#00BFA5)', boxShadow:'0 0 40px rgba(0,230,118,0.4)'}}>
              ✂️ Go to Dashboard
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </a>
          ) : (
            <a href="#login" className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg text-background transition-all hover:scale-105 active:scale-95 shadow-lg" style={{background:'linear-gradient(135deg,#00E676,#00BFA5)', boxShadow:'0 0 40px rgba(0,230,118,0.4)'}}>
              ✂️ Start Clipping Free
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
            </a>
          )}
        </div>
      </section>

      {/* Feature Marquee */}
      <FeatureMarquee />

      {/* How it works */}
      <section className="py-20 px-4 max-w-5xl mx-auto w-full">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-black text-white mb-3">How Slicer Works</h2>
          <p className="text-muted text-lg">Three steps. Zero headaches.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: '01', icon: '📤', title: 'Upload or Paste', desc: 'Drag & drop a video file or paste a YouTube, Twitch, or Twitter URL. Up to 2GB supported.' },
            { step: '02', icon: '🤖', title: 'AI Does the Work', desc: 'Slicer detects highlights, cuts clips at the right moments, and generates accurate subtitles with Whisper AI.' },
            { step: '03', icon: '📱', title: 'Export & Post', desc: 'Download your clips formatted perfectly for TikTok (9:16), YouTube Shorts, Twitter/X, or custom format.' },
          ].map((item) => (
            <div key={item.step} className="relative bg-surface rounded-2xl border border-white/10 p-6 hover:border-green-400/30 transition-all">
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-background" style={{background:'linear-gradient(135deg,#00E676,#00BFA5)'}}>{item.step}</div>
              <div className="text-4xl mb-4">{item.icon}</div>
              <h3 className="text-white font-bold text-lg mb-2">{item.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="py-16 px-4 bg-surface/30 border-y border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-3">Everything You Need</h2>
            <p className="text-muted text-lg">Built for creators who ship daily.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: '✂️', title: 'Smart Clip Detection', desc: 'AI identifies peak engagement moments — loud cheers, key phrases, action sequences.' },
              { icon: '📝', title: 'Auto Subtitles', desc: 'Whisper AI transcribes and burns in subtitles. Bold, clean, shadow, outline — you choose the style.' },
              { icon: '📐', title: 'Platform Formats', desc: 'Auto-resize to TikTok 9:16, YouTube 16:9, or Shorts. No manual cropping.' },
              { icon: '🎛️', title: 'Full Control', desc: "Adjust clip count, length, subtitle colors, output quality up to 4K. You're the director." },
              { icon: '⚡', title: 'Fast Pipeline', desc: 'FFmpeg-powered processing with live progress updates. See exactly what stage you\'re at.' },
              { icon: '☁️', title: 'Secure Storage', desc: 'All your clips stored safely. Download anytime, delete when done. Your content, your control.' },
            ].map((f) => (
              <div key={f.title} className="bg-background rounded-xl border border-white/5 p-5 hover:border-green-400/20 transition-all">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h4 className="text-white font-semibold mb-1">{f.title}</h4>
                <p className="text-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MCV badge */}
      <section className="py-16 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full border border-green-400/20 bg-green-400/5 mb-6">
            <span className="text-2xl">🚀</span>
            <span className="text-green-400 font-semibold">Built by Mars Cats Voyage</span>
          </div>
          <p className="text-muted text-lg mb-8">Slicer is an internal MCV tool built for the community first. Phase 3 brings $CREAM token-gated premium features — hold 100 $CREAM to unlock 4K quality, unlimited clips, and direct social posting.</p>
        </div>
      </section>

      {/* Login / CTA section */}
      {!user && (
        <section id="login" className="flex flex-col items-center justify-center px-4 pb-24">
          <div className="w-full max-w-md rounded-2xl border p-8 shadow-2xl" style={{background:'linear-gradient(135deg, rgba(0,230,118,0.05), rgba(0,191,165,0.05))', borderColor:'rgba(0,230,118,0.2)', boxShadow:'0 0 60px rgba(0,230,118,0.1)'}}>
            <div className="text-center mb-6">
              <div className="mb-3 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/slicer-logo.png" alt="Slicer" width={64} height={64} className="rounded-xl" style={{filter:'drop-shadow(0 0 12px rgba(0,230,118,0.5))'}} />
              </div>
              <h2 className="text-2xl font-black text-white mb-1">Start Clipping Today</h2>
              <p className="text-muted text-sm">Free forever. No credit card required.</p>
            </div>
            <SocialLogin />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-muted text-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">✂️ Slicer</span>
          <span className="text-muted/60">·</span>
          <span>by Mars Cats Voyage</span>
        </div>
        <div className="flex gap-6">
          <a href="https://twitter.com/MarsCatsVoyage" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">Twitter/X</a>
          <a href="https://discord.gg/marscats" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">Discord</a>
        </div>
        <p className="text-muted/50 text-xs">© 2025 Mars Cats Voyage. All rights reserved.</p>
      </footer>
    </div>
  )
}
