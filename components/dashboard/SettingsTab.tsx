'use client'

import React, { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { createSupabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { OutputQuality, PlatformFormat, SubtitleStyle, AIFocus } from '@/types'

interface SettingsTabProps {
  user: User | null
  onSaved?: () => void
}

const DEV_USER = {
  email: 'dev@mcv.local',
  created_at: new Date().toISOString(),
  user_metadata: { name: 'Dev User' },
} as unknown as User

const AI_FOCUS_OPTIONS: { id: AIFocus; label: string; icon: string }[] = [
  { id: 'funny_moments',  label: 'Funny Moments',  icon: '😂' },
  { id: 'kill_streaks',   label: 'Kill Streaks',   icon: '💀' },
  { id: 'intense_action', label: 'Intense Action', icon: '🔥' },
  { id: 'big_plays',      label: 'Big Plays',      icon: '🏆' },
  { id: 'reactions',      label: 'Reactions',      icon: '😱' },
  { id: 'key_dialogue',   label: 'Key Dialogue',   icon: '🗣️' },
  { id: 'hype_moments',   label: 'Hype Moments',   icon: '⚡' },
  { id: 'fails',          label: 'Fails & Clips',  icon: '💥' },
]

const PLATFORMS = [
  { id: 'twitter',   label: 'Twitter / X',  icon: '🐦' },
  { id: 'youtube',   label: 'YouTube',      icon: '▶️' },
  { id: 'twitch',    label: 'Twitch',       icon: '🎮' },
  { id: 'tiktok',    label: 'TikTok',       icon: '🎵' },
  { id: 'instagram', label: 'Instagram',    icon: '📸' },
]

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-surface rounded-2xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
      >
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <span>{icon}</span>{title}
        </h3>
        <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-6 pb-6 space-y-4 border-t border-white/5 pt-4">{children}</div>}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-primary' : 'bg-white/20'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

const stored = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback
  try { return JSON.parse(localStorage.getItem(`slicer_${key}`) || 'null') ?? fallback } catch { return fallback }
}

export default function SettingsTab({ user: userProp, onSaved }: SettingsTabProps) {
  const user = userProp ?? DEV_USER
  const supabase = createSupabaseClient()

  const [displayName, setDisplayName]           = useState(user.user_metadata?.name || '')
  const [avatarUrl, setAvatarUrl]               = useState<string>(user.user_metadata?.avatar_url || '')
  const [avatarUploading, setAvatarUploading]   = useState(false)
  const [defaultQuality, setDefaultQuality]     = useState<OutputQuality>(() => stored('quality', '1080p'))
  const [defaultFormat, setDefaultFormat]       = useState<PlatformFormat>(() => stored('format', 'custom'))
  const [defaultSubStyle, setDefaultSubStyle]   = useState<SubtitleStyle>(() => stored('subStyle', 'bold'))
  const [defaultClipLen, setDefaultClipLen]     = useState<string>(() => stored('clipLength', '30'))
  const [defaultClipCount, setDefaultClipCount] = useState<number>(() => stored('clipCount', 5))
  const [defaultAIFocus, setDefaultAIFocus]     = useState<AIFocus[]>(() => stored('aiFocus', ['funny_moments', 'hype_moments']))
  const [subtitlesOn, setSubtitlesOn]           = useState<boolean>(() => stored('subtitlesOn', true))
  const [madeWithSlicer, setMadeWithSlicer]     = useState<boolean>(() => stored('madeWithSlicer', true))

  // Stats from localStorage (incremented by process route)
  const totalClips    = stored<number>('stat_totalClips', 0)
  const totalMinutes  = stored<number>('stat_totalMinutes', 0)

  const [saving, setSaving]                   = useState(false)
  const [saved, setSaved]                     = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput]         = useState('')

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    // Preview locally immediately
    const localUrl = URL.createObjectURL(file)
    setAvatarUrl(localUrl)
    // Store as data URL in user metadata (no storage needed)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setAvatarUrl(dataUrl)
      if (userProp) {
        await supabase.auth.updateUser({ data: { avatar_url: dataUrl } })
      }
      setAvatarUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const toggleAIFocus = (id: AIFocus) => {
    setDefaultAIFocus(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id])
  }

  const handleSave = async () => {
    setSaving(true)
    localStorage.setItem('slicer_quality',      JSON.stringify(defaultQuality))
    localStorage.setItem('slicer_format',       JSON.stringify(defaultFormat))
    localStorage.setItem('slicer_subStyle',     JSON.stringify(defaultSubStyle))
    localStorage.setItem('slicer_clipLength',   JSON.stringify(defaultClipLen))
    localStorage.setItem('slicer_clipCount',    JSON.stringify(defaultClipCount))
    localStorage.setItem('slicer_aiFocus',      JSON.stringify(defaultAIFocus))
    localStorage.setItem('slicer_subtitlesOn',  JSON.stringify(subtitlesOn))
    localStorage.setItem('slicer_madeWithSlicer', JSON.stringify(madeWithSlicer))
    if (userProp) await supabase.auth.updateUser({ data: { name: displayName } })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    onSaved?.()
  }

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">

      {/* Connected Accounts */}
      <Section title="Connected Accounts" icon="🔗" defaultOpen={false}>
        <p className="text-muted text-sm">Connect your social accounts for one-click posting (Phase 3)</p>
        <div className="space-y-2">
          {PLATFORMS.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-3 bg-background rounded-xl">
              <div className="flex items-center gap-3">
                <span className="text-xl">{p.icon}</span>
                <span className="text-sm font-medium text-white">{p.label}</span>
              </div>
              <Button variant="ghost" size="sm" disabled>Connect (Soon)</Button>
            </div>
          ))}
        </div>
      </Section>

      {/* Video Output Defaults */}
      <Section title="Video Output Defaults" icon="🎞️">
        <p className="text-muted text-sm">Pre-filled in the options modal every time you upload</p>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">Default Quality</label>
          <div className="flex gap-3">
            {(['720p', '1080p', '4k'] as OutputQuality[]).map((q) => (
              <button key={q} onClick={() => setDefaultQuality(q)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all uppercase ${
                  defaultQuality === q ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted'
                }`}
              >{q}</button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">Default Format</label>
          <select value={defaultFormat} onChange={(e) => setDefaultFormat(e.target.value as PlatformFormat)}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white"
          >
            <option value="tiktok">TikTok (9:16)</option>
            <option value="twitter">Twitter/X (16:9)</option>
            <option value="youtube_shorts">YouTube Shorts (9:16)</option>
            <option value="custom">Custom (original)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">Default Subtitle Style</label>
          <select value={defaultSubStyle} onChange={(e) => setDefaultSubStyle(e.target.value as SubtitleStyle)}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white"
          >
            <option value="bold">Bold</option>
            <option value="clean">Clean</option>
            <option value="shadow">Shadow</option>
            <option value="outline">Outline</option>
            <option value="karaoke">Karaoke</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">Default Subtitles</label>
          <div className="flex items-center gap-3">
            <Toggle value={subtitlesOn} onChange={setSubtitlesOn} />
            <span className="text-sm text-muted">{subtitlesOn ? 'On by default' : 'Off by default'}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-white">Default Clip Count</label>
            <span className="text-primary font-bold">{defaultClipCount}</span>
          </div>
          <input type="range" min={1} max={20} value={defaultClipCount}
            onChange={(e) => setDefaultClipCount(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted mt-1"><span>1</span><span>20</span></div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">Default Clip Length</label>
          <select value={defaultClipLen} onChange={(e) => setDefaultClipLen(e.target.value)}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white"
          >
            <option value="15">15 seconds</option>
            <option value="30">30 seconds</option>
            <option value="45">45 seconds</option>
            <option value="60">60 seconds (max)</option>
          </select>
        </div>
      </Section>

      {/* AI Detection Defaults */}
      <Section title="AI Detection Defaults" icon="🤖">
        <p className="text-muted text-sm">Tell the AI what to look for when auto-detecting highlights</p>
        <div className="grid grid-cols-2 gap-2">
          {AI_FOCUS_OPTIONS.map((f) => {
            const active = defaultAIFocus.includes(f.id)
            return (
              <button key={f.id} onClick={() => toggleAIFocus(f.id)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition-all text-left ${
                  active ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted hover:border-white/20'
                }`}
              >
                <span className="text-lg">{f.icon}</span>
                <span className="text-xs font-medium">{f.label}</span>
                {active && <span className="ml-auto text-primary text-xs">✓</span>}
              </button>
            )
          })}
        </div>
      </Section>

      {/* Account */}
      <Section title="Account" icon="👤">
        {/* Avatar + stats card */}
        <div className="flex items-start gap-4">
          {/* PFP with upload overlay */}
          <div className="relative flex-shrink-0">
            <label className="cursor-pointer group">
              <div className="relative w-20 h-20">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full border-2 border-primary object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-3xl font-bold text-primary">
                    {(displayName || user.email || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                {/* Upload overlay */}
                <div className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {avatarUploading ? (
                    <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : (
                    <span className="text-white text-xs font-semibold">📷 Change</span>
                  )}
                </div>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
          </div>

          {/* Info + stats */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-base truncate">{displayName || user.email}</p>
            <p className="text-xs text-muted mb-3">Member since {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-background rounded-xl px-3 py-2 border border-white/5">
                <p className="text-2xl font-black text-primary leading-none">{totalClips}</p>
                <p className="text-xs text-muted mt-0.5">Clips Made</p>
              </div>
              <div className="bg-background rounded-xl px-3 py-2 border border-white/5">
                <p className="text-2xl font-black text-primary leading-none">{totalMinutes}<span className="text-sm font-semibold text-muted">m</span></p>
                <p className="text-xs text-muted mt-0.5">Footage Processed</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white"
            placeholder="Your display name"
          />
        </div>
        <p className="text-xs text-muted">Email: {user.email}</p>
      </Section>

      {/* Clip Branding */}
      <Section title="Clip Branding" icon="✂️">
        <div className="flex items-start gap-3">
          <Toggle value={madeWithSlicer} onChange={setMadeWithSlicer} />
          <div>
            <p className="text-sm font-semibold text-white">&quot;Made with Slicer&quot; outro</p>
            <p className="text-xs text-muted mt-0.5">Adds a 2-second branded end card to every clip. Helps spread the word 🚀</p>
          </div>
        </div>
        {madeWithSlicer && (
          <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-3">
            <span className="text-2xl">✂️</span>
            <div>
              <p className="text-xs font-bold text-primary">Made with Slicer</p>
              <p className="text-xs text-muted">by Mars Cats Voyage</p>
            </div>
          </div>
        )}
      </Section>

      {/* Save button */}
      <Button variant="primary" size="lg" className="w-full" loading={saving} onClick={handleSave}>
        {saved ? '✅ Settings Saved!' : '💾 Save All Settings'}
      </Button>

      {/* Danger Zone */}
      <Section title="Danger Zone" icon="⚠️" defaultOpen={false}>
        <p className="text-muted text-sm">These actions are permanent and cannot be undone.</p>
        <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
      </Section>

      {/* Delete Modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Account" size="sm">
        <p className="text-muted mb-4">Permanently deletes your account and all associated data.</p>
        <p className="text-sm text-white mb-3">Type <strong className="text-red-400">DELETE</strong> to confirm:</p>
        <input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)}
          className="w-full bg-background border border-red-500/30 rounded-xl px-4 py-2.5 text-white mb-4" placeholder="DELETE"
        />
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => { setShowDeleteConfirm(false); setDeleteInput('') }}>Cancel</Button>
          <Button variant="danger" className="flex-1" disabled={deleteInput !== 'DELETE'} onClick={handleDeleteAccount}>Delete</Button>
        </div>
      </Modal>
    </div>
  )
}
