'use client'

import React, { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type {
  ProcessingOptions,
  ClipLength,
  DetectionMode,
  SubtitleStyle,
  SubtitleSize,
  OutputQuality,
  PlatformFormat,
  AIFocus,
} from '@/types'

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

const getDefaultOptions = (): ProcessingOptions => {
  const stored = <T,>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback
    try { return JSON.parse(localStorage.getItem(`slicer_${key}`) || 'null') ?? fallback } catch { return fallback }
  }
  return {
    clipCount: stored<number>('clipCount', 5),
    clipLength: stored<ClipLength>('clipLength', '30'),
    detectionMode: 'auto',
    aiFocus: stored<AIFocus[]>('aiFocus', ['funny_moments', 'hype_moments']),
    manualRange: { startPct: 0, endPct: 100 },
    subtitles: {
      enabled: stored<boolean>('subtitlesOn', true),
      style: stored<SubtitleStyle>('subStyle', 'bold'),
      size: 'medium',
      color: '#ffffff',
      background: false,
    },
    outputQuality: stored<OutputQuality>('quality', '1080p'),
    platformFormat: stored<PlatformFormat>('format', 'custom'),
  }
}

interface OptionsModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (options: ProcessingOptions, title: string) => void
  loading?: boolean
}

function getDefaultTitle(): string {
  const now = new Date()
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} · ${time}`
}

// Collapsible section wrapper
function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/5 hover:bg-white/8 transition-colors"
      >
        <span className="text-sm font-semibold text-white flex items-center gap-2">
          <span>{icon}</span> {title}
        </span>
        <span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 space-y-4">{children}</div>}
    </div>
  )
}

// Toggle switch
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${value ? 'bg-primary' : 'bg-white/20'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function OptionsModal({ isOpen, onClose, onStart, loading = false }: OptionsModalProps) {
  const [options, setOptions] = useState<ProcessingOptions>(() => getDefaultOptions())
  const [title, setTitle] = useState<string>('')
  const [titleEdited, setTitleEdited] = useState(false)

  React.useEffect(() => {
    if (isOpen) {
      setOptions(getDefaultOptions())
      setTitle(getDefaultTitle())
      setTitleEdited(false)
    }
  }, [isOpen])

  const update = (patch: Partial<ProcessingOptions>) => setOptions((prev) => ({ ...prev, ...patch }))
  const updateSubtitles = (patch: Partial<ProcessingOptions['subtitles']>) =>
    setOptions((prev) => ({ ...prev, subtitles: { ...prev.subtitles, ...patch } }))

  const toggleAIFocus = (id: AIFocus) => {
    setOptions((prev) => {
      const has = prev.aiFocus.includes(id)
      return { ...prev, aiFocus: has ? prev.aiFocus.filter(f => f !== id) : [...prev.aiFocus, id] }
    })
  }

  // Cap clip length at 60s
  const clipLengthOptions: { value: ClipLength; label: string }[] = [
    { value: '15', label: '15 seconds' },
    { value: '30', label: '30 seconds' },
    { value: '45', label: '45 seconds' },
    { value: '60', label: '60 seconds (max)' },
    { value: 'custom', label: 'Custom (up to 60s)' },
  ]

  const manualRange = options.manualRange ?? { startPct: 0, endPct: 100 }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚙️ Clip Options" size="lg">
      <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">

        {/* Job Title */}
        <div>
          <label className="block text-xs text-muted font-semibold mb-1.5 uppercase tracking-wider">Session Title</label>
          <input
            type="text"
            value={title}
            onFocus={() => {
              if (!titleEdited) {
                setTitle('')
                setTitleEdited(true)
              }
            }}
            onBlur={() => {
              if (!title.trim()) {
                setTitle(getDefaultTitle())
                setTitleEdited(false)
              }
            }}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-muted/50 focus:border-primary transition-colors"
            placeholder={getDefaultTitle()}
          />
        </div>

        {/* Clip Count */}
        <Section title="Clip Count" icon="🎬">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted">How many clips to generate</span>
              <span className="text-primary font-bold text-xl">{options.clipCount}</span>
            </div>
            <input
              type="range" min={1} max={20} value={options.clipCount}
              onChange={(e) => update({ clipCount: Number(e.target.value) })}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted mt-1"><span>1</span><span>20</span></div>
          </div>
        </Section>

        {/* Clip Length */}
        <Section title="Clip Length" icon="⏱️">
          <select
            value={options.clipLength}
            onChange={(e) => update({ clipLength: e.target.value as ClipLength })}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary transition-colors"
          >
            {clipLengthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {options.clipLength === 'custom' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted">Custom length (seconds)</span>
                <span className="text-primary font-bold">{Math.min(options.customClipLength || 30, 60)}s</span>
              </div>
              <input
                type="range" min={5} max={60}
                value={Math.min(options.customClipLength || 30, 60)}
                onChange={(e) => update({ customClipLength: Number(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted mt-1"><span>5s</span><span>60s max</span></div>
            </div>
          )}
        </Section>

        {/* Detection Mode */}
        <Section title="Detection Mode" icon="🎯">
          <div className="flex gap-3">
            {(['auto', 'manual'] as DetectionMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => update({ detectionMode: mode })}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all ${
                  options.detectionMode === mode ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted hover:border-white/30'
                }`}
              >
                {mode === 'auto' ? '🤖 Auto (AI)' : '✋ Manual'}
              </button>
            ))}
          </div>

          {/* AI Focus — shown when auto */}
          {options.detectionMode === 'auto' && (
            <div>
              <p className="text-xs text-muted mb-3">What should the AI look for? Select all that apply:</p>
              <div className="grid grid-cols-2 gap-2">
                {AI_FOCUS_OPTIONS.map((f) => {
                  const active = options.aiFocus.includes(f.id)
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleAIFocus(f.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border transition-all text-left ${
                        active ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted hover:border-white/30'
                      }`}
                    >
                      <span className="text-lg">{f.icon}</span>
                      <span className="font-medium text-xs">{f.label}</span>
                      {active && <span className="ml-auto text-primary text-xs">✓</span>}
                    </button>
                  )
                })}
              </div>
              {options.aiFocus.length === 0 && (
                <p className="text-xs text-yellow-400 mt-2">⚠️ Select at least one focus type</p>
              )}
            </div>
          )}

          {/* Manual range sliders — shown when manual */}
          {options.detectionMode === 'manual' && (
            <div className="space-y-4">
              <p className="text-xs text-muted">Drag to select the portion of the video to clip:</p>
              <div>
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>Start: <span className="text-white font-semibold">{manualRange.startPct}%</span></span>
                  <span>End: <span className="text-white font-semibold">{manualRange.endPct}%</span></span>
                </div>
                {/* Visual range bar */}
                <div className="relative h-8 bg-white/5 rounded-lg overflow-hidden mb-3">
                  <div
                    className="absolute h-full bg-primary/30 border-x-2 border-primary"
                    style={{ left: `${manualRange.startPct}%`, width: `${manualRange.endPct - manualRange.startPct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-primary font-semibold">
                    {manualRange.endPct - manualRange.startPct}% selected
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Start point</label>
                    <input
                      type="range" min={0} max={manualRange.endPct - 5}
                      value={manualRange.startPct}
                      onChange={(e) => update({ manualRange: { ...manualRange, startPct: Number(e.target.value) } })}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">End point</label>
                    <input
                      type="range" min={manualRange.startPct + 5} max={100}
                      value={manualRange.endPct}
                      onChange={(e) => update({ manualRange: { ...manualRange, endPct: Number(e.target.value) } })}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Subtitles */}
        <Section title="Subtitles" icon="📝">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white">Enable subtitles</span>
            <Toggle value={options.subtitles.enabled} onChange={(v) => updateSubtitles({ enabled: v })} />
          </div>
          {options.subtitles.enabled && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs text-muted mb-1.5">Style</label>
                <select
                  value={options.subtitles.style}
                  onChange={(e) => updateSubtitles({ style: e.target.value as SubtitleStyle })}
                  className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="bold">Bold</option>
                  <option value="clean">Clean</option>
                  <option value="shadow">Shadow</option>
                  <option value="outline">Outline</option>
                  <option value="karaoke">Karaoke</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Size</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as SubtitleSize[]).map((s) => (
                    <button key={s} onClick={() => updateSubtitles({ size: s })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize ${
                        options.subtitles.size === s ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted'
                      }`}
                    >{s}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-muted mb-1.5">Color</label>
                  <input type="color" value={options.subtitles.color}
                    onChange={(e) => updateSubtitles({ color: e.target.value })}
                    className="h-9 w-full rounded-lg border border-white/10 bg-background cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-2 pb-1">
                  <label className="text-xs text-muted">Background</label>
                  <Toggle value={options.subtitles.background} onChange={(v) => updateSubtitles({ background: v })} />
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Output Quality */}
        <Section title="Output Quality" icon="🎞️">
          <div className="flex gap-3">
            {(['720p', '1080p', '4k'] as OutputQuality[]).map((q) => (
              <button key={q} onClick={() => update({ outputQuality: q })}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all uppercase ${
                  options.outputQuality === q ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 text-muted hover:border-white/30'
                }`}
              >{q}</button>
            ))}
          </div>
        </Section>

        {/* Platform Format */}
        <Section title="Platform Format" icon="📱">
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'tiktok',         label: '🎵 TikTok',     sub: '9:16 · max 60s' },
              { value: 'twitter',        label: '🐦 Twitter/X',  sub: '16:9 · max 60s' },
              { value: 'youtube_shorts', label: '▶️ YT Shorts',  sub: '9:16 · max 60s' },
              { value: 'custom',         label: '⚙️ Custom',     sub: 'Original ratio' },
            ].map((p) => (
              <button key={p.value} onClick={() => update({ platformFormat: p.value as PlatformFormat })}
                className={`py-3 px-4 rounded-xl border transition-all text-left ${
                  options.platformFormat === p.value ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="text-sm font-semibold text-white">{p.label}</div>
                <div className="text-xs text-muted">{p.sub}</div>
              </button>
            ))}
          </div>
        </Section>

        {/* Submit */}
        <div className="pt-1">
          <Button
            variant="primary" size="lg" className="w-full" loading={loading}
            onClick={() => {
              if (options.detectionMode === 'auto' && options.aiFocus.length === 0) return
              onStart(options, title.trim() || getDefaultTitle())
            }}
          >
            🚀 Start Processing
          </Button>
        </div>
      </div>
    </Modal>
  )
}
