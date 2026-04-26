'use client'

import { useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import { ProcessingOptions } from '@/types'

type Subscription = {
  id: string
  ownerName?: string
  ownerEmail?: string
  platform: 'twitch' | 'youtube' | 'x' | 'direct'
  handle?: string
  channelUrl?: string
  title?: string
  status: 'active' | 'paused'
  options?: Partial<ProcessingOptions>
  lastCheckedAt?: string | null
  lastSeenStreamId?: string | null
  lastJobId?: string | null
  createdAt: string
}

const DEFAULT_AUTOCUT_OPTIONS: Partial<ProcessingOptions> = {
  clipCount: 10,
  clipLength: '30',
  detectionMode: 'gaming',
  aiFocus: ['intense_action', 'big_plays', 'hype_moments', 'funny_moments'],
  outputQuality: '720p',
  platformFormat: 'twitter',
  subtitles: {
    enabled: true,
    size: 'medium',
    color: '#ffffff',
    position: 'bottom',
    style: 'bold',
    background: 'none',
    font: 'impact',
    mode: 'active_word',
    preset: 'auto',
    animationPreset: 'pop',
    highlightColor: '#ffeb3b',
    activeWordStyle: 'pill',
    safeZone: 'bottom_safe',
    outlineThickness: 'thick',
    outlineColor: '#000000',
    shadow: true,
    textCase: 'original',
    watermarkEnabled: true,
  },
}

function normalizeHandle(input: string) {
  const value = input.trim().replace(/^@/, '')
  if (!value) return ''
  try {
    const parsed = new URL(value)
    const parts = parsed.pathname.split('/').filter(Boolean)
    return parts[0] || value
  } catch {
    return value.split('/').filter(Boolean).pop() || value
  }
}

function formatDate(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}

export default function AutoClipTab() {
  const [platform, setPlatform] = useState<'twitch' | 'youtube' | 'x'>('twitch')
  const [handle, setHandle] = useState('')
  const [email, setEmail] = useState('')
  const [clipCount, setClipCount] = useState(10)
  const [clipLength, setClipLength] = useState<'15' | '30' | '45' | '60'>('30')
  const [priorityHint, setPriorityHint] = useState('')
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pollResult, setPollResult] = useState<any>(null)

  const cleanedHandle = useMemo(() => normalizeHandle(handle), [handle])

  const loadSubscriptions = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/autoclip/subscriptions')
      const data = await res.json()
      setSubscriptions(data.subscriptions || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load auto-clips')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSubscriptions()
  }, [])

  const createSubscription = async () => {
    if (!cleanedHandle) {
      setError(`Enter a ${platform === 'youtube' ? 'YouTube channel' : platform === 'x' ? 'X handle' : 'Twitch handle'} first`)
      return
    }
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const options: Partial<ProcessingOptions> = {
        ...DEFAULT_AUTOCUT_OPTIONS,
        clipCount,
        clipLength,
        priorityHint,
      }
      const res = await fetch('/api/autoclip/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          handle: cleanedHandle,
          ownerEmail: email.trim() || undefined,
          title: `${platform === 'youtube' ? 'YouTube' : platform === 'x' ? 'X' : 'Twitch'} auto-clips: ${cleanedHandle}`,
          options,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create auto-clip signup')
      setMessage(`Auto-clipping enabled for ${platform === 'youtube' ? 'YouTube' : platform === 'x' ? 'X' : 'twitch.tv'}/${cleanedHandle}`)
      setHandle('')
      setEmail('')
      setPriorityHint('')
      await loadSubscriptions()
    } catch (err: any) {
      setError(err?.message || 'Failed to create auto-clip signup')
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (id: string, status: 'active' | 'paused') => {
    setError(null)
    try {
      const res = await fetch(`/api/autoclip/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update subscription')
      await loadSubscriptions()
    } catch (err: any) {
      setError(err?.message || 'Failed to update subscription')
    }
  }

  const deleteSubscription = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/autoclip/subscriptions/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to delete subscription')
      await loadSubscriptions()
    } catch (err: any) {
      setError(err?.message || 'Failed to delete subscription')
    }
  }

  const checkNow = async (dryRun = true) => {
    setChecking(true)
    setError(null)
    setMessage(null)
    setPollResult(null)
    try {
      const res = await fetch('/api/autoclip/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'vod', dryRun }),
      })
      const data = await res.json()
      setPollResult(data)
      if (!res.ok) throw new Error(data.error || 'Auto-check failed')
      const queued = (data.results || []).filter((r: any) => r.status === 'queued').length
      const wouldQueue = (data.results || []).filter((r: any) => r.status === 'would_queue').length
      setMessage(dryRun ? `Dry run complete: ${wouldQueue} new VOD(s) would queue.` : `Auto-check complete: ${queued} job(s) queued.`)
      await loadSubscriptions()
    } catch (err: any) {
      setError(err?.message || 'Auto-check failed')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="py-8 md:py-10 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-red-400 text-sm font-bold mb-2">AUTO-CLIP SIGNUP</p>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">Let Slicer watch the stream for you.</h1>
            <p className="text-white/50 leading-7">
              Lowest-friction flow: users enter a Twitch or YouTube handle once. Slicer checks for new public VODs/uploads, queues the latest one, and processes clips with their saved settings.
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/80 max-w-md">
            <strong className="text-amber-100">Admin note:</strong> Twitch auto-detection needs backend <code className="text-amber-50">TWITCH_CLIENT_ID</code> and <code className="text-amber-50">TWITCH_CLIENT_SECRET</code>. YouTube uses public channel RSS for basic latest-upload detection. Users never see backend credentials.
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[1fr_0.9fr] gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Create auto-clip signup</h2>
            <p className="text-sm text-white/35">Twitch, YouTube, and X are available. X uses backend API/scraper access when configured.</p>
          </div>

          <div>
            <span className="text-sm font-medium text-white/70 mb-2 block">Platform</span>
            <div className="grid grid-cols-3 gap-2 max-w-2xl">
              {([
                { value: 'twitch', label: 'Twitch', desc: 'Archive VODs' },
                { value: 'youtube', label: 'YouTube', desc: 'Public uploads' },
                { value: 'x', label: 'X', desc: 'Broadcast posts' },
              ] as const).map((item) => (
                <button
                  key={item.value}
                  onClick={() => setPlatform(item.value)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${platform === item.value ? 'border-red-500 bg-red-500/10 text-white' : 'border-white/10 text-white/45 hover:text-white hover:border-white/25'}`}
                >
                  <div className="text-sm font-bold">{item.label}</div>
                  <div className="text-[11px] text-white/30">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-white/70 mb-2 block">{platform === 'youtube' ? 'YouTube channel / @handle' : platform === 'x' ? 'X handle' : 'Twitch handle'}</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={platform === 'youtube' ? '@MarsCatsVoyage or youtube.com/@MarsCatsVoyage' : platform === 'x' ? '@cryptosloth or x.com/cryptosloth' : 'cryptosloth or twitch.tv/cryptosloth'}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-white/70 mb-2 block">Notify email / contact <span className="text-white/30">optional</span></span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="creator@email.com"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between text-sm text-white/70 mb-2"><span>Clips per VOD</span><span className="text-white">{clipCount}</span></div>
              <input type="range" min={1} max={10} value={clipCount} onChange={(e) => setClipCount(Number(e.target.value))} className="w-full accent-red-500" />
            </div>
            <div>
              <span className="text-sm font-medium text-white/70 mb-2 block">Clip length</span>
              <div className="grid grid-cols-4 gap-2">
                {(['15', '30', '45', '60'] as const).map((length) => (
                  <button
                    key={length}
                    onClick={() => setClipLength(length)}
                    className={`py-2 rounded-lg border text-sm font-semibold ${clipLength === length ? 'border-red-500 bg-red-500/10 text-red-300' : 'border-white/10 text-white/45 hover:text-white'}`}
                  >
                    {length}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-white/70 mb-2 block">Clip priority <span className="text-white/30">optional</span></span>
            <textarea
              value={priorityHint}
              maxLength={180}
              onChange={(e) => setPriorityHint(e.target.value)}
              placeholder="Examples: gunfights, clutch moments, funny rage, big wins"
              className="min-h-[86px] w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
            />
          </label>

          {platform === 'youtube' && (
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs leading-5 text-blue-100/75">
              YouTube auto-detect uses public channel RSS. It works for public uploads/archive posts; private, members-only, or unlisted videos will not appear.
            </div>
          )}
          {platform === 'x' && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-100/75">
              X auto-detect scans recent original posts for broadcast links and live/stream language. It needs backend X API/scraper credentials; manual X URLs still work in Upload.
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-center">
            <Button onClick={createSubscription} disabled={submitting || !cleanedHandle}>
              {submitting ? 'Saving…' : 'Enable Auto-Clipping'}
            </Button>
            <Button variant="secondary" onClick={() => checkNow(true)} disabled={checking || subscriptions.length === 0}>
              {checking ? 'Checking…' : 'Dry Run Check'}
            </Button>
          </div>

          {message && <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-100/80">{message}</div>}
          {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100/80">{error}</div>}
          {pollResult && (
            <pre className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-white/45">
              {JSON.stringify(pollResult, null, 2)}
            </pre>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">Active signups</h2>
              <p className="text-sm text-white/35">Handles Slicer will watch.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadSubscriptions}>Refresh</Button>
          </div>

          {loading ? (
            <div className="text-white/40 text-sm">Loading…</div>
          ) : subscriptions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-white/35 text-sm">No auto-clip signups yet.</div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-bold">{sub.platform === 'twitch' ? 'Twitch' : sub.platform === 'youtube' ? 'YouTube' : sub.platform === 'x' ? 'X' : 'Video'} - {sub.handle || sub.channelUrl}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sub.status === 'active' ? 'border-green-500/30 text-green-300 bg-green-500/10' : 'border-white/10 text-white/35 bg-white/5'}`}>{sub.status}</span>
                      </div>
                      <div className="text-xs text-white/30 space-y-1">
                        <div>Clips: {sub.options?.clipCount || 10} × {sub.options?.clipLength || '30'}s</div>
                        <div>Last checked: {formatDate(sub.lastCheckedAt)}</div>
                        <div>Last seen: {sub.lastSeenStreamId || 'None yet'}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => updateStatus(sub.id, sub.status === 'active' ? 'paused' : 'active')}>
                        {sub.status === 'active' ? 'Pause' : 'Resume'}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => deleteSubscription(sub.id)}>Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
