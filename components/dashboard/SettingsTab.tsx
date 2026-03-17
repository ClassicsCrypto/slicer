'use client'

import React, { useState } from 'react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { createSupabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { OutputQuality, PlatformFormat, SubtitleStyle } from '@/types'

interface SettingsTabProps {
  user: User | null
}

const PLATFORMS = [
  { id: 'twitter', label: 'Twitter / X', icon: '🐦' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
  { id: 'twitch', label: 'Twitch', icon: '🎮' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'instagram', label: 'Instagram', icon: '📸' },
]

// Dev placeholder user
const DEV_USER = {
  email: 'dev@mcv.local',
  created_at: new Date().toISOString(),
  user_metadata: { name: 'Dev User' },
} as unknown as User

export default function SettingsTab({ user: userProp }: SettingsTabProps) {
  const user = userProp ?? DEV_USER
  const [displayName, setDisplayName] = useState(user.user_metadata?.name || '')
  const [defaultQuality, setDefaultQuality] = useState<OutputQuality>('1080p')
  const [defaultFormat, setDefaultFormat] = useState<PlatformFormat>('custom')
  const [defaultSubStyle, setDefaultSubStyle] = useState<SubtitleStyle>('bold')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createSupabaseClient()

  const handleSave = async () => {
    setSaving(true)
    await supabase.auth.updateUser({ data: { name: displayName } })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return
    // In production: call a server-side API route to delete user via admin SDK
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">

      {/* Connected Accounts */}
      <section className="bg-surface rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-bold text-white mb-1">Connected Accounts</h3>
        <p className="text-muted text-sm mb-6">Connect your social accounts for one-click posting (Phase 3)</p>
        <div className="space-y-3">
          {PLATFORMS.map((platform) => (
            <div key={platform.id} className="flex items-center justify-between p-3 bg-background rounded-xl">
              <div className="flex items-center gap-3">
                <span className="text-xl">{platform.icon}</span>
                <span className="text-sm font-medium text-white">{platform.label}</span>
              </div>
              <Button variant="ghost" size="sm" disabled>
                Connect (Soon)
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Video Output Defaults */}
      <section className="bg-surface rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-bold text-white mb-1">Video Output Defaults</h3>
        <p className="text-muted text-sm mb-6">These settings will be pre-filled in the options modal</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Default Quality</label>
            <div className="flex gap-3">
              {(['720p', '1080p', '4k'] as OutputQuality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => setDefaultQuality(q)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all uppercase ${
                    defaultQuality === q ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Default Format</label>
            <select
              value={defaultFormat}
              onChange={(e) => setDefaultFormat(e.target.value as PlatformFormat)}
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
            <select
              value={defaultSubStyle}
              onChange={(e) => setDefaultSubStyle(e.target.value as SubtitleStyle)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white"
            >
              <option value="bold">Bold</option>
              <option value="clean">Clean</option>
              <option value="shadow">Shadow</option>
              <option value="outline">Outline</option>
              <option value="karaoke">Karaoke</option>
            </select>
          </div>
        </div>
      </section>

      {/* Account Management */}
      <section className="bg-surface rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-bold text-white mb-1">Account</h3>
        <p className="text-muted text-sm mb-6">Manage your profile</p>
        <div className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            {user.user_metadata?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.user_metadata.avatar_url}
                alt="Avatar"
                className="w-16 h-16 rounded-full border-2 border-primary"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-2xl">
                🐱
              </div>
            )}
            <div>
              <p className="font-semibold text-white">{user.email}</p>
              <p className="text-xs text-muted">Member since {new Date(user.created_at).toLocaleDateString()}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-2">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white"
              placeholder="Your display name"
            />
          </div>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {saved ? '✅ Saved!' : 'Save Changes'}
          </Button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="bg-surface rounded-2xl border border-red-500/30 p-6">
        <h3 className="text-lg font-bold text-red-400 mb-1">⚠️ Danger Zone</h3>
        <p className="text-muted text-sm mb-4">These actions are permanent and cannot be undone.</p>
        <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
          Delete Account
        </Button>
      </section>

      {/* Delete Confirm Modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Account" size="sm">
        <p className="text-muted mb-4">
          This will permanently delete your account and all associated data including all clips and jobs.
          This <strong className="text-white">cannot be undone</strong>.
        </p>
        <p className="text-sm text-white mb-3">Type <strong className="text-red-400">DELETE</strong> to confirm:</p>
        <input
          type="text"
          value={deleteInput}
          onChange={(e) => setDeleteInput(e.target.value)}
          className="w-full bg-background border border-red-500/30 rounded-xl px-4 py-2.5 text-white mb-4"
          placeholder="DELETE"
        />
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => { setShowDeleteConfirm(false); setDeleteInput('') }}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={deleteInput !== 'DELETE'}
            onClick={handleDeleteAccount}
          >
            Delete Account
          </Button>
        </div>
      </Modal>
    </div>
  )
}
