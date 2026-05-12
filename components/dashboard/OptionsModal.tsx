'use client'

import {
  ProcessingOptions,
  AIFocus,
  ClipLength,
  DetectionMode,
  SubtitleOptions,
  SubtitleSize,
  SubtitleColor,
  SubtitlePosition,
  SubtitleFont,
  SubtitleMode,
  SubtitlePreset,
  SubtitleSafeZone,
  SubtitleAnimationPreset,
  ActiveWordStyle,
  SubtitleOutlineThickness,
  SubtitleCase,
} from '@/types'
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

const DETECTION_MODES: { value: DetectionMode; label: string; desc: string }[] = [
  { value: 'default', label: 'Balanced', desc: 'smart default' },
  { value: 'gaming', label: 'Gaming', desc: 'kills, wins, action' },
  { value: 'funny', label: 'Funny', desc: 'bits, fails, chaos' },
  { value: 'conversation', label: 'Dialogue', desc: 'spoken moments' },
]

const SUBTITLE_PRESETS: { value: SubtitlePreset; label: string; desc: string; options: Partial<SubtitleOptions> }[] = [
  { value: 'auto', label: 'Auto', desc: 'Slicer default', options: { mode: 'active_word', font: 'impact', size: 'medium', safeZone: 'bottom_safe', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'medium', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'original', watermarkEnabled: true } },
  { value: 'clean_tiktok', label: 'Clean TikTok', desc: 'clean creator captions', options: { mode: 'phrase', font: 'montserrat', size: 'medium', safeZone: 'bottom_safe', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'medium', outlineColor: '#000000', shadow: true, animationPreset: 'fade', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'gaming_pop', label: 'Gaming Pop', desc: 'punchy action style', options: { mode: 'active_word', font: 'impact', size: 'large', safeZone: 'bottom_safe', color: '#ffffff', highlightColor: '#ff4d4d', outlineThickness: 'thick', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'upper' } },
  { value: 'hormozi_highlight', label: 'Keyword Highlight', desc: 'highlight key words', options: { mode: 'active_word', font: 'arial_black', size: 'medium', safeZone: 'center_safe', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'thick', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'mcv_branded', label: 'MCV Branded', desc: 'red accent + watermark', options: { mode: 'active_word', font: 'sora', size: 'medium', safeZone: 'bottom_safe', color: '#ffffff', highlightColor: '#ff4d4d', outlineThickness: 'thick', outlineColor: '#050505', shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'original', watermarkEnabled: true } },
  { value: 'meme_bold', label: 'Meme Bold', desc: 'big all-caps style', options: { mode: 'word_pop', font: 'impact', size: 'large', safeZone: 'center_safe', color: '#ffffff', highlightColor: '#00e5ff', outlineThickness: 'thick', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'scale', textCase: 'upper' } },
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

function choiceClass(active: boolean) {
  return `rounded-lg border px-3 py-2 text-left text-sm transition-all ${
    active
      ? 'border-red-500 bg-red-500/10 text-white'
      : 'border-white/10 bg-black/20 text-white/50 hover:border-white/30 hover:text-white'
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
  const updateSubtitles = (patch: Partial<SubtitleOptions>) => {
    onChange({ ...options, subtitles: { ...options.subtitles, ...patch } })
  }

  const applySubtitlePreset = (preset: SubtitlePreset) => {
    const selected = SUBTITLE_PRESETS.find((entry) => entry.value === preset) || SUBTITLE_PRESETS[0]
    updateSubtitles({ preset, ...selected.options })
  }

  const toggleFocus = (focus: AIFocus) => {
    const current = options.aiFocus
    const next = current.includes(focus)
      ? current.filter((f) => f !== focus)
      : [...current, focus]
    onChange({ ...options, aiFocus: next })
  }

  return (
    <Modal open={open} onClose={onClose} title="Clip Options" maxWidth="max-w-3xl">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
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
              {CLIP_LENGTHS.map((l) => (
                <button
                  type="button"
                  key={l.value}
                  onClick={() => onChange({ ...options, clipLength: l.value })}
                  className={`py-2 rounded-lg border text-sm font-semibold transition-all ${
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
        </div>

        {/* Smarter Selection */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-white">Smarter Selection</h3>
            <p className="text-xs text-white/35">Pick how Slicer should score the source before AI focus is applied.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {DETECTION_MODES.map((mode) => (
              <button
                type="button"
                key={mode.value}
                onClick={() => onChange({ ...options, detectionMode: mode.value })}
                className={choiceClass((options.detectionMode || 'default') === mode.value)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{mode.label}</span>
                  {(options.detectionMode || 'default') === mode.value && <span className="text-red-300">✓</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-white/35">{mode.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Keyword Detection */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <label className="mb-2 block text-sm font-bold text-white">Keyword Detection <span className="text-white/30">optional</span></label>
          <textarea
            value={options.priorityHint || ''}
            maxLength={180}
            rows={3}
            onChange={(e) => onChange({ ...options, priorityHint: e.target.value })}
            placeholder="Tell Slicer what to prioritize: boss fights, funny rants, Mars Cats mentions, clutch plays, specific names, specific game cues…"
            className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
          />
          <div className="mt-1 text-right text-[11px] text-white/25">{(options.priorityHint || '').length}/180</div>
        </div>

        {/* AI Focus */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <label className="block text-sm font-medium text-white/70 mb-2">AI Focus</label>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {AI_FOCUS_OPTIONS.map((f) => {
              const active = options.aiFocus.includes(f.value)
              return (
                <button
                  type="button"
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
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="text-sm font-medium text-white/70">Subtitle Choices</label>
              <p className="text-xs text-white/35">Set the default caption style before processing.</p>
            </div>
            <button
              type="button"
              onClick={() => updateSubtitles({ enabled: !options.subtitles.enabled })}
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
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Preset</label>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {SUBTITLE_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.value}
                      onClick={() => applySubtitlePreset(preset.value)}
                      className={choiceClass((options.subtitles.preset || 'auto') === preset.value)}
                    >
                      <div className="font-semibold">{preset.label}</div>
                      <div className="text-[11px] text-white/35">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Caption Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'phrase' as SubtitleMode, label: 'Phrase' },
                      { value: 'active_word' as SubtitleMode, label: 'Active Word' },
                      { value: 'word_pop' as SubtitleMode, label: 'Word Pop' },
                      { value: 'karaoke' as SubtitleMode, label: 'Karaoke' },
                    ]).map((mode) => (
                      <button type="button" key={mode.value} onClick={() => updateSubtitles({ mode: mode.value })} className={choiceClass((options.subtitles.mode || 'active_word') === mode.value)}>
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Animation</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['none', 'fade', 'pop'] as SubtitleAnimationPreset[]).map((animation) => (
                      <button type="button" key={animation} onClick={() => updateSubtitles({ animationPreset: animation })} className={choiceClass((options.subtitles.animationPreset || 'pop') === animation)}>
                        {animation.charAt(0).toUpperCase() + animation.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Font</label>
                  <select value={options.subtitles.font || 'impact'} onChange={(e) => updateSubtitles({ font: e.target.value as SubtitleFont })} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
                    <option value="impact">Impact</option>
                    <option value="bebas">Bebas Neue</option>
                    <option value="montserrat">Montserrat</option>
                    <option value="sora">Sora</option>
                    <option value="arial_black">Arial Black</option>
                    <option value="trebuchet">Trebuchet</option>
                    <option value="verdana">Verdana</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Size</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as SubtitleSize[]).map((size) => (
                      <button type="button" key={size} onClick={() => updateSubtitles({ size })} className={choiceClass(options.subtitles.size === size)}>
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Position</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['bottom', 'center', 'top'] as SubtitlePosition[]).map((position) => (
                      <button type="button" key={position} onClick={() => updateSubtitles({ position })} className={choiceClass(options.subtitles.position === position)}>
                        {position.charAt(0).toUpperCase() + position.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Safe Zone</label>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      { value: 'bottom_safe' as SubtitleSafeZone, label: 'Bottom' },
                      { value: 'center_safe' as SubtitleSafeZone, label: 'Center' },
                      { value: 'upper_safe' as SubtitleSafeZone, label: 'Upper' },
                      { value: 'auto' as SubtitleSafeZone, label: 'Auto' },
                    ]).map((zone) => (
                      <button type="button" key={zone.value} onClick={() => updateSubtitles({ safeZone: zone.value })} className={choiceClass((options.subtitles.safeZone || 'bottom_safe') === zone.value)}>
                        {zone.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Active Word</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['color', 'scale', 'pill', 'underline'] as ActiveWordStyle[]).map((style) => (
                      <button type="button" key={style} onClick={() => updateSubtitles({ activeWordStyle: style })} className={choiceClass((options.subtitles.activeWordStyle || 'pill') === style)}>
                        {style.charAt(0).toUpperCase() + style.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Text Color</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: '#ffffff' as SubtitleColor, label: 'White', swatch: '#ffffff' },
                      { value: '#ffff00' as SubtitleColor, label: 'Yellow', swatch: '#ffff00' },
                      { value: '#FF4D4D' as SubtitleColor, label: 'Mars Red', swatch: '#FF4D4D' },
                    ]).map((color) => (
                      <button type="button" key={color.value} onClick={() => updateSubtitles({ color: color.value })} className={`flex items-center gap-1.5 ${choiceClass(options.subtitles.color === color.value)}`}>
                        <span className="h-3 w-3 rounded-full" style={{ background: color.swatch }} />
                        {color.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Highlight Color</label>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { value: '#ffeb3b', label: 'Yellow', swatch: '#ffeb3b' },
                      { value: '#ff4d4d', label: 'Mars Red', swatch: '#ff4d4d' },
                      { value: '#00e5ff', label: 'Blue', swatch: '#00e5ff' },
                    ]).map((color) => (
                      <button type="button" key={color.value} onClick={() => updateSubtitles({ highlightColor: color.value })} className={`flex items-center gap-1.5 ${choiceClass((options.subtitles.highlightColor || '#ffeb3b') === color.value)}`}>
                        <span className="h-3 w-3 rounded-full" style={{ background: color.swatch }} />
                        {color.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Outline</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['thin', 'medium', 'thick'] as SubtitleOutlineThickness[]).map((outlineThickness) => (
                      <button type="button" key={outlineThickness} onClick={() => updateSubtitles({ outlineThickness })} className={choiceClass((options.subtitles.outlineThickness || 'medium') === outlineThickness)}>
                        {outlineThickness.charAt(0).toUpperCase() + outlineThickness.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Text Case</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: 'original' as SubtitleCase, label: 'Original' },
                      { value: 'upper' as SubtitleCase, label: 'UPPER' },
                      { value: 'title' as SubtitleCase, label: 'Title' },
                    ]).map((textCase) => (
                      <button type="button" key={textCase.value} onClick={() => updateSubtitles({ textCase: textCase.value })} className={choiceClass((options.subtitles.textCase || 'original') === textCase.value)}>
                        {textCase.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1.5">Extras</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => updateSubtitles({ shadow: !options.subtitles.shadow })} className={choiceClass(!!options.subtitles.shadow)}>Shadow</button>
                    <button type="button" onClick={() => updateSubtitles({ watermarkEnabled: !options.subtitles.watermarkEnabled })} className={choiceClass(!!options.subtitles.watermarkEnabled)}>Watermark</button>
                  </div>
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
