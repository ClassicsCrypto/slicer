'use client'

import { ProcessingOptions, ClipLength, DetectionMode } from '@/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const CLIP_LENGTHS: { value: ClipLength; label: string; desc: string }[] = [
  { value: '15', label: '15s', desc: 'tight' },
  { value: '30', label: '30s', desc: 'default' },
  { value: '45', label: '45s', desc: 'context' },
  { value: '60', label: '60s', desc: 'full beat' },
]

const DETECTION_MODES: { value: DetectionMode; label: string; desc: string }[] = [
  { value: 'default', label: 'Balanced', desc: 'general smart picks' },
  { value: 'gaming', label: 'Gameplay', desc: 'kills, wins, action' },
  { value: 'funny', label: 'Funny', desc: 'bits, fails, reactions' },
  { value: 'conversation', label: 'Dialogue', desc: 'spoken moments' },
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

function cardClass(active: boolean) {
  return `rounded-xl border p-3 text-left transition-all ${
    active
      ? 'border-red-500 bg-red-500/10 text-white shadow-[0_0_24px_rgba(255,77,77,0.08)]'
      : 'border-white/10 bg-black/20 text-white/55 hover:border-white/25 hover:text-white'
  }`
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
  return (
    <Modal open={open} onClose={onClose} title="Clip Options" maxWidth="max-w-2xl">
      <div className="space-y-6">
        {/* Clip Count */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <label className="block text-sm font-medium text-white/70 mb-2">
            Number of Clips: <span className="text-white">{options.clipCount}</span>
          </label>
          <input
            type="range"
            min={1}
            max={10}
            value={options.clipCount}
            onChange={(e) => onChange({ ...options, clipCount: parseInt(e.target.value) })}
            className="w-full accent-red-500"
          />
          <div className="flex justify-between text-xs text-white/30 mt-1">
            <span>1</span><span>10</span>
          </div>
        </div>

        {/* Clip Length */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <label className="block text-sm font-medium text-white/70 mb-2">Clip Length</label>
          <div className="grid grid-cols-4 gap-2">
            {CLIP_LENGTHS.map((length) => (
              <button
                type="button"
                key={length.value}
                onClick={() => onChange({ ...options, clipLength: length.value })}
                className={cardClass(options.clipLength === length.value)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{length.label}</span>
                  {options.clipLength === length.value && <span className="text-red-300">✓</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-white/35">{length.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Selection Mode */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white">Selection Mode</h3>
            <p className="text-xs leading-5 text-white/35">Choose what Slicer should bias toward while scoring the source.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {DETECTION_MODES.map((mode) => {
              const active = (options.detectionMode || 'default') === mode.value
              return (
                <button
                  type="button"
                  key={mode.value}
                  onClick={() => onChange({ ...options, detectionMode: mode.value })}
                  className={cardClass(active)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{mode.label}</span>
                    {active && <span className="text-red-300">✓</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-white/35">{mode.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Keywords */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <label className="mb-2 block text-sm font-bold text-white">
            Keywords / Priority <span className="text-white/30">optional</span>
          </label>
          <textarea
            value={options.priorityHint || ''}
            maxLength={180}
            rows={3}
            onChange={(e) => onChange({ ...options, priorityHint: e.target.value })}
            placeholder="Tell Slicer what to prioritize — boss fights, funny rants, Mars Cats mentions, clutch plays, specific names, specific game cues…"
            className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] text-white/25">
            <span>Soft bias only. Slicer still rejects weak clips.</span>
            <span>{(options.priorityHint || '').length}/180</span>
          </div>
        </div>

        {/* Quality + Format */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Quality</label>
            <select
              value={options.outputQuality}
              onChange={(e) => onChange({ ...options, outputQuality: e.target.value as '720p' | '1080p' })}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Aspect Ratio</label>
            <select
              value={options.platformFormat}
              onChange={(e) => onChange({ ...options, platformFormat: e.target.value as ProcessingOptions['platformFormat'] })}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="twitter">16:9 Landscape (YouTube/Twitter)</option>
              <option value="tiktok">9:16 Vertical (TikTok/Reels/Shorts)</option>
              <option value="youtube_shorts">1:1 Square (Instagram)</option>
              <option value="custom">Original (no crop)</option>
            </select>
          </div>
        </div>

        {/* Video info */}
        {fetchingInfo && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <span className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            <span className="text-xs text-white/40">Fetching video info...</span>
          </div>
        )}
        {videoInfo && !fetchingInfo && (
          <div className="px-3 py-2.5 rounded-lg border bg-green-500/10 border-green-500/20">
            <span className="text-xs text-white/60">
              📏 <strong>{videoInfo.durationMin > 0 ? `${videoInfo.durationMin} min` : 'Broadcast'}</strong> — Estimated processing: <strong className="text-green-400">{
                videoInfo.durationMin === 0 ? 'May take 10-20 minutes for broadcasts'
                : videoInfo.durationMin <= 2 ? 'Less than 2 minutes'
                : videoInfo.durationMin <= 10 ? '~2-3 minutes'
                : videoInfo.durationMin <= 30 ? '~3-5 minutes'
                : videoInfo.durationMin <= 60 ? '~5-8 minutes'
                : '~10-15 minutes'
              }</strong>
            </span>
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting…
              </span>
            ) : (
              '🚀 Start Processing'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
