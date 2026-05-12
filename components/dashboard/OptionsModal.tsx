'use client'

import { ProcessingOptions, AIFocus, ClipLength, DetectionMode } from '@/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const AI_FOCUS_OPTIONS: { value: AIFocus; label: string; icon: string; desc: string }[] = [
  { value: 'funny_moments', label: 'Funny Moments', icon: '\uD83D\uDE02', desc: 'jokes, chaos, reactions' },
  { value: 'kill_streaks', label: 'Kill Streaks', icon: '\uD83D\uDC80', desc: 'multi-kills and streaks' },
  { value: 'intense_action', label: 'Intense Action', icon: '\uD83D\uDD25', desc: 'fights, tension, pressure' },
  { value: 'big_plays', label: 'Big Plays', icon: '\uD83C\uDFC6', desc: 'wins and clutch moments' },
  { value: 'reactions', label: 'Reactions', icon: '\uD83D\uDE31', desc: 'facecam or voice spikes' },
  { value: 'key_dialogue', label: 'Key Dialogue', icon: '\uD83D\uDDE3\uFE0F', desc: 'strong spoken moments' },
  { value: 'hype_moments', label: 'Hype Moments', icon: '\u26A1', desc: 'high-energy clips' },
  { value: 'fails', label: 'Fails', icon: '\uD83D\uDCA5', desc: 'mistakes worth clipping' },
]

const CLIP_LENGTHS: { value: ClipLength; label: string; desc: string }[] = [
  { value: '15', label: '15s', desc: 'tight cuts' },
  { value: '30', label: '30s', desc: 'default' },
  { value: '45', label: '45s', desc: 'context' },
  { value: '60', label: '60s', desc: 'full beat' },
]

const DETECTION_MODES: { value: DetectionMode; label: string; desc: string }[] = [
  { value: 'default', label: 'Default', desc: 'balanced clip scoring' },
  { value: 'gaming', label: 'Gaming', desc: 'combat, wins, objectives' },
  { value: 'funny', label: 'Funny', desc: 'bits, fails, laughs' },
  { value: 'conversation', label: 'Dialogue', desc: 'clear spoken moments' },
]

interface OptionsModalProps {
  open: boolean
  onClose: () => void
  options: ProcessingOptions
  onChange: (opts: ProcessingOptions) => void
  onConfirm: () => void
  isSubmitting: boolean
  videoInfo?: { duration: number; durationMin: number; title: string; estimatedCredits: number; creditLimit: number } | null
  fetchingInfo?: boolean
}

function Toggle({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-red-500' : 'bg-white/20'}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function OptionCard({
  active,
  label,
  desc,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  desc?: string
  icon?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-all ${
        active
          ? 'border-red-500 bg-red-500/10 text-white shadow-[0_0_24px_rgba(255,77,77,0.08)]'
          : 'border-white/10 bg-black/20 text-white/50 hover:border-white/25 hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-base leading-none">{icon}</span>}
        <span className="text-sm font-bold">{label}</span>
        {active && <span className="ml-auto text-xs text-red-300">✓</span>}
      </div>
      {desc && <div className="mt-1 text-[11px] leading-4 text-white/35">{desc}</div>}
    </button>
  )
}

export default function OptionsModal({
  open,
  onClose,
  options,
  onChange,
  onConfirm,
  isSubmitting,
  videoInfo,
  fetchingInfo,
}: OptionsModalProps) {
  const toggleFocus = (focus: AIFocus) => {
    const next = options.aiFocus.includes(focus)
      ? options.aiFocus.filter((f) => f !== focus)
      : [...options.aiFocus, focus]
    onChange({ ...options, aiFocus: next })
  }

  const updateSubtitles = (patch: Partial<ProcessingOptions['subtitles']>) => {
    onChange({ ...options, subtitles: { ...options.subtitles, ...patch } })
  }

  return (
    <Modal open={open} onClose={onClose} title="Clip Options" maxWidth="max-w-2xl">
      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white">Clip count</h3>
              <p className="text-xs text-white/35">How many finished clips Slicer should target.</p>
            </div>
            <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-lg font-black text-red-100">{options.clipCount}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={options.clipCount}
            onChange={(e) => onChange({ ...options, clipCount: parseInt(e.target.value, 10) })}
            className="w-full accent-red-500"
          />
          <div className="mt-1 flex justify-between text-xs text-white/30"><span>1</span><span>10</span></div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white">Clip length</h3>
            <p className="text-xs text-white/35">Pick the target length for each cut.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CLIP_LENGTHS.map((length) => (
              <OptionCard
                key={length.value}
                active={options.clipLength === length.value}
                label={length.label}
                desc={length.desc}
                onClick={() => onChange({ ...options, clipLength: length.value })}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white">Detection mode</h3>
            <p className="text-xs text-white/35">Tune what Slicer treats as a strong moment.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DETECTION_MODES.map((mode) => (
              <OptionCard
                key={mode.value}
                active={options.detectionMode === mode.value}
                label={mode.label}
                desc={mode.desc}
                onClick={() => onChange({ ...options, detectionMode: mode.value })}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white">AI focus</h3>
            <p className="text-xs text-white/35">Select all clip types the model should favor.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AI_FOCUS_OPTIONS.map((focus) => (
              <OptionCard
                key={focus.value}
                active={options.aiFocus.includes(focus.value)}
                label={focus.label}
                desc={focus.desc}
                icon={focus.icon}
                onClick={() => toggleFocus(focus.value)}
              />
            ))}
          </div>
          {options.aiFocus.length === 0 && <p className="mt-2 text-xs text-yellow-300">Select at least one focus type before processing.</p>}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white">Subtitles</h3>
              <p className="text-xs text-white/35">Generate captions now; fine-tune styling per clip after processing.</p>
            </div>
            <Toggle checked={options.subtitles.enabled} onClick={() => updateSubtitles({ enabled: !options.subtitles.enabled })} />
          </div>
          {options.subtitles.enabled && (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/45">
              Per-clip subtitle styling stays in the Clips tab so upload stays clean and fast.
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <span className="mb-2 block text-sm font-bold text-white">Quality</span>
            <select
              value={options.outputQuality}
              onChange={(e) => onChange({ ...options, outputQuality: e.target.value as ProcessingOptions['outputQuality'] })}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
          <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <span className="mb-2 block text-sm font-bold text-white">Aspect ratio</span>
            <select
              value={options.platformFormat}
              onChange={(e) => onChange({ ...options, platformFormat: e.target.value as ProcessingOptions['platformFormat'] })}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none"
            >
              <option value="twitter">16:9 Landscape (YouTube/Twitter)</option>
              <option value="tiktok">9:16 Vertical (TikTok/Reels/Shorts)</option>
              <option value="youtube_shorts">1:1 Square (Instagram)</option>
              <option value="custom">Original (no crop)</option>
            </select>
          </label>
        </section>

        <label className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <span className="mb-2 block text-sm font-bold text-white">Clip priority <span className="text-white/30">optional</span></span>
          <textarea
            value={options.priorityHint || ''}
            maxLength={180}
            onChange={(e) => onChange({ ...options, priorityHint: e.target.value })}
            placeholder="Examples: gunfights, clutch moments, funny rage, big wins"
            className="min-h-[72px] w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
          />
        </label>

        {fetchingInfo && (
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
            <span className="text-xs text-white/40">Fetching video info...</span>
          </div>
        )}
        {videoInfo && !fetchingInfo && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-xs text-white/60">
            <strong>{videoInfo.durationMin > 0 ? `${videoInfo.durationMin} min` : 'Broadcast'}</strong> — Estimated processing: <strong className="text-green-300">{
              videoInfo.durationMin === 0 ? 'May take 10-20 minutes for broadcasts'
              : videoInfo.durationMin <= 2 ? 'Less than 2 minutes'
              : videoInfo.durationMin <= 10 ? '~2-3 minutes'
              : videoInfo.durationMin <= 30 ? '~3-5 minutes'
              : videoInfo.durationMin <= 60 ? '~5-8 minutes'
              : '~10-15 minutes'
            }</strong>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isSubmitting || options.aiFocus.length === 0}
            className="flex-1"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Submitting...
              </span>
            ) : 'Start Processing'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
