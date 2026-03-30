'use client'

import { ProcessingOptions, AIFocus, ClipLength, SubtitleOptions, SubtitleSize, SubtitleColor, SubtitlePosition, SubtitleStyle, SubtitleBackground } from '@/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const AI_FOCUS_OPTIONS: { value: AIFocus; label: string; emoji: string }[] = [
  { value: 'funny_moments', label: 'Funny Moments', emoji: '😂' },
  { value: 'kill_streaks', label: 'Kill Streaks', emoji: '🔫' },
  { value: 'intense_action', label: 'Intense Action', emoji: '💥' },
  { value: 'big_plays', label: 'Big Plays', emoji: '🏆' },
  { value: 'reactions', label: 'Reactions', emoji: '😮' },
  { value: 'key_dialogue', label: 'Key Dialogue', emoji: '💬' },
  { value: 'hype_moments', label: 'Hype Moments', emoji: '🔥' },
  { value: 'fails', label: 'Fails', emoji: '💀' },
]

const CLIP_LENGTHS: { value: ClipLength; label: string }[] = [
  { value: '15', label: '15s' },
  { value: '30', label: '30s' },
  { value: '45', label: '45s' },
  { value: '60', label: '60s' },
]

interface OptionsModalProps {
  open: boolean
  onClose: () => void
  options: ProcessingOptions
  onChange: (opts: ProcessingOptions) => void
  onConfirm: () => void
  isSubmitting: boolean
}

export default function OptionsModal({
  open,
  onClose,
  options,
  onChange,
  onConfirm,
  isSubmitting,
}: OptionsModalProps) {
  const toggleFocus = (focus: AIFocus) => {
    const current = options.aiFocus
    const next = current.includes(focus)
      ? current.filter((f) => f !== focus)
      : [...current, focus]
    onChange({ ...options, aiFocus: next })
  }

  return (
    <Modal open={open} onClose={onClose} title="Clip Options" maxWidth="max-w-xl">
      <div className="space-y-6">
        {/* Clip Count */}
        <div>
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
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">Clip Length</label>
          <div className="flex gap-2">
            {CLIP_LENGTHS.map((l) => (
              <button
                key={l.value}
                onClick={() => onChange({ ...options, clipLength: l.value })}
                className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${
                  options.clipLength === l.value
                    ? 'border-red-500 text-red-400 bg-red-500/10'
                    : 'border-white/10 text-white/50 hover:border-white/30'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI Focus */}
        <div>
          <label className="block text-sm font-medium text-white/70 mb-2">AI Focus</label>
          <div className="grid grid-cols-2 gap-2">
            {AI_FOCUS_OPTIONS.map((f) => {
              const active = options.aiFocus.includes(f.value)
              return (
                <button
                  key={f.value}
                  onClick={() => toggleFocus(f.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    active
                      ? 'border-red-500 bg-red-500/10 text-white'
                      : 'border-white/10 text-white/50 hover:border-white/30'
                  }`}
                >
                  <span>{f.emoji}</span>
                  <span>{f.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Subtitle Options */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-white/70">Subtitles</label>
            <button
              onClick={() => onChange({
                ...options,
                subtitles: { ...options.subtitles, enabled: !options.subtitles.enabled },
              })}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                options.subtitles.enabled ? 'bg-red-500' : 'bg-white/20'
              }`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                options.subtitles.enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {options.subtitles.enabled && (
            <div className="space-y-4 pl-1">
              {/* Size */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Size</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as SubtitleSize[]).map(s => (
                    <button
                      key={s}
                      onClick={() => onChange({ ...options, subtitles: { ...options.subtitles, size: s } })}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        options.subtitles.size === s
                          ? 'border-red-500 text-red-400 bg-red-500/10'
                          : 'border-white/10 text-white/50 hover:border-white/30'
                      }`}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Color</label>
                <div className="flex gap-2">
                  {([
                    { value: '#ffffff' as SubtitleColor, label: 'White', swatch: '#ffffff' },
                    { value: '#ffff00' as SubtitleColor, label: 'Yellow', swatch: '#ffff00' },
                    { value: '#FF4D4D' as SubtitleColor, label: 'Mars Red', swatch: '#FF4D4D' },
                  ]).map(c => (
                    <button
                      key={c.value}
                      onClick={() => onChange({ ...options, subtitles: { ...options.subtitles, color: c.value } })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                        options.subtitles.color === c.value
                          ? 'border-red-500 bg-red-500/10 text-white'
                          : 'border-white/10 text-white/50 hover:border-white/30'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-full" style={{ background: c.swatch }} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Position */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Position</label>
                <div className="flex gap-2">
                  {(['bottom', 'center', 'top'] as SubtitlePosition[]).map(p => (
                    <button
                      key={p}
                      onClick={() => onChange({ ...options, subtitles: { ...options.subtitles, position: p } })}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        options.subtitles.position === p
                          ? 'border-red-500 text-red-400 bg-red-500/10'
                          : 'border-white/10 text-white/50 hover:border-white/30'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'karaoke' as SubtitleStyle, label: '✨ Karaoke', desc: 'Word-by-word highlight' },
                    { value: 'bold' as SubtitleStyle, label: '𝐁 Bold', desc: 'Simple bold text' },
                    { value: 'outline' as SubtitleStyle, label: '◻ Outline', desc: 'Text with outline' },
                    { value: 'shadow' as SubtitleStyle, label: '🌑 Shadow', desc: 'Drop shadow' },
                  ]).map(s => (
                    <button
                      key={s.value}
                      onClick={() => onChange({ ...options, subtitles: { ...options.subtitles, style: s.value } })}
                      className={`px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                        options.subtitles.style === s.value
                          ? 'border-red-500 bg-red-500/10 text-white'
                          : 'border-white/10 text-white/50 hover:border-white/30'
                      }`}
                    >
                      <div className="font-semibold">{s.label}</div>
                      <div className="text-white/30 text-[10px]">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Background */}
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Background</label>
                <div className="flex gap-2">
                  {([
                    { value: 'none' as SubtitleBackground, label: 'None' },
                    { value: 'blur' as SubtitleBackground, label: 'Dark Blur' },
                    { value: 'solid' as SubtitleBackground, label: 'Solid Black' },
                  ]).map(b => (
                    <button
                      key={b.value}
                      onClick={() => onChange({ ...options, subtitles: { ...options.subtitles, background: b.value } })}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                        options.subtitles.background === b.value
                          ? 'border-red-500 text-red-400 bg-red-500/10'
                          : 'border-white/10 text-white/50 hover:border-white/30'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
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
            <label className="block text-sm font-medium text-white/70 mb-2">Format</label>
            <select
              value={options.platformFormat}
              onChange={(e) => onChange({ ...options, platformFormat: e.target.value as ProcessingOptions['platformFormat'] })}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="tiktok">TikTok (9:16)</option>
              <option value="twitter">Twitter (16:9)</option>
              <option value="youtube_shorts">YouTube Shorts</option>
              <option value="custom">Custom</option>
            </select>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isSubmitting || options.aiFocus.length === 0}
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
