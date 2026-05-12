'use client'

import {
  ProcessingOptions,
  AIFocus,
  ClipLength,
  DetectionMode,
  SubtitleAnimationPreset,
  SubtitleCase,
  SubtitleFont,
  SubtitleMode,
  SubtitleOptions,
  SubtitlePreset,
  SubtitleSafeZone,
  SubtitleSize,
  SubtitleStyle,
  SubtitleBackground,
  ActiveWordStyle,
} from '@/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

const AI_FOCUS_OPTIONS: { value: AIFocus; label: string; desc: string }[] = [
  { value: 'funny_moments', label: 'Funny Moments', desc: 'jokes, chaos, reactions' },
  { value: 'kill_streaks', label: 'Kill Streaks', desc: 'multi-kills and streaks' },
  { value: 'intense_action', label: 'Intense Action', desc: 'fights, tension, pressure' },
  { value: 'big_plays', label: 'Big Plays', desc: 'wins and clutch moments' },
  { value: 'reactions', label: 'Reactions', desc: 'facecam or voice spikes' },
  { value: 'key_dialogue', label: 'Key Dialogue', desc: 'strong spoken moments' },
  { value: 'hype_moments', label: 'Hype Moments', desc: 'high-energy clips' },
  { value: 'fails', label: 'Fails', desc: 'mistakes worth clipping' },
]

const CLIP_LENGTHS: { value: ClipLength; label: string; desc: string }[] = [
  { value: '15', label: '15s', desc: 'tight cuts' },
  { value: '30', label: '30s', desc: 'default' },
  { value: '45', label: '45s', desc: 'context' },
  { value: '60', label: '60s', desc: 'full beat' },
]

const DETECTION_MODES: { value: DetectionMode; label: string; desc: string }[] = [
  { value: 'default', label: 'Balanced', desc: 'general smart selection' },
  { value: 'gaming', label: 'Gaming', desc: 'combat, wins, objectives' },
  { value: 'funny', label: 'Funny', desc: 'bits, fails, laughs' },
  { value: 'conversation', label: 'Dialogue', desc: 'clear spoken moments' },
]

const SUBTITLE_PRESETS: { value: SubtitlePreset; label: string; desc: string; options: Partial<SubtitleOptions> }[] = [
  { value: 'auto', label: 'Auto', desc: 'Slicer picks a safe creator-ready default', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'impact', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'thick', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'original' } },
  { value: 'clean_tiktok', label: 'Clean TikTok', desc: 'white native-style captions', options: { mode: 'phrase', safeZone: 'bottom_safe', font: 'montserrat', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'medium', outlineColor: '#000000', shadow: true, animationPreset: 'fade', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'gaming_pop', label: 'Gaming Pop', desc: 'big punchy action captions', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'impact', size: 'large', color: '#ffffff', highlightColor: '#ff3b30', outlineThickness: 'thick', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'upper' } },
  { value: 'hormozi_highlight', label: 'Keyword Highlight', desc: 'active keyword emphasis', options: { mode: 'active_word', safeZone: 'center_safe', font: 'arial_black', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'thick', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'mcv_branded', label: 'MCV Branded', desc: 'red highlight + watermark-ready', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'sora', size: 'medium', color: '#ffffff', highlightColor: '#ff4d4d', outlineThickness: 'thick', outlineColor: '#050505', shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'original', watermarkEnabled: true } },
  { value: 'meme_bold', label: 'Meme Bold', desc: 'loud all-caps punchline style', options: { mode: 'word_pop', safeZone: 'center_safe', font: 'impact', size: 'large', color: '#ffffff', highlightColor: '#00e5ff', outlineThickness: 'thick', outlineColor: '#000000', shadow: true, animationPreset: 'pop', activeWordStyle: 'scale', textCase: 'upper' } },
]

const SUBTITLE_MODES: { value: SubtitleMode; label: string; desc: string }[] = [
  { value: 'phrase', label: 'Phrase', desc: 'classic chunked captions' },
  { value: 'active_word', label: 'Active Word', desc: 'highlight current word' },
  { value: 'word_pop', label: 'Word Pop', desc: 'one word at a time' },
  { value: 'karaoke', label: 'Karaoke', desc: 'timed sweep highlight' },
]

const SAFE_ZONES: { value: SubtitleSafeZone; label: string }[] = [
  { value: 'bottom_safe', label: 'Bottom' },
  { value: 'center_safe', label: 'Center' },
  { value: 'upper_safe', label: 'Upper' },
  { value: 'auto', label: 'Auto' },
]

const FONT_OPTIONS: { value: SubtitleFont; label: string }[] = [
  { value: 'impact', label: 'Impact' },
  { value: 'bebas', label: 'Bebas Neue' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'sora', label: 'Sora' },
  { value: 'arial_black', label: 'Arial Black' },
  { value: 'trebuchet', label: 'Trebuchet' },
  { value: 'verdana', label: 'Verdana' },
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

function ChoiceCard({ active, label, desc, onClick }: { active: boolean; label: string; desc?: string; onClick: () => void }) {
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
        <span className="text-sm font-bold">{label}</span>
        {active && <span className="ml-auto text-xs text-red-300">✓</span>}
      </div>
      {desc && <div className="mt-1 text-[11px] leading-4 text-white/35">{desc}</div>}
    </button>
  )
}

function Toggle({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-all ${checked ? 'border-red-500/30 bg-red-500/15 text-red-100' : 'border-white/10 bg-black/20 text-white/45 hover:text-white'}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${checked ? 'bg-red-400' : 'bg-white/25'}`} />
      {label}
    </button>
  )
}

function applySubtitlePreset(current: SubtitleOptions, preset: SubtitlePreset): SubtitleOptions {
  const selected = SUBTITLE_PRESETS.find((entry) => entry.value === preset) || SUBTITLE_PRESETS[0]
  return {
    ...current,
    ...selected.options,
    preset,
    enabled: true,
  }
}

export default function OptionsModal({ open, onClose, options, onChange, onConfirm, isSubmitting, videoInfo, fetchingInfo }: OptionsModalProps) {
  const updateSubtitles = (patch: Partial<SubtitleOptions>) => {
    onChange({ ...options, subtitles: { ...options.subtitles, ...patch } })
  }

  const toggleFocus = (focus: AIFocus) => {
    onChange({
      ...options,
      aiFocus: options.aiFocus.includes(focus)
        ? options.aiFocus.filter((entry) => entry !== focus)
        : [...options.aiFocus, focus],
    })
  }

  const subtitles = options.subtitles

  return (
    <Modal open={open} onClose={onClose} title="Clip Options" maxWidth="max-w-4xl">
      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-red-300">Smarter selection</h3>
              <p className="text-xs leading-5 text-white/40">Choose the detection style, clip targets, and keywords before Slicer scores the source.</p>
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1 text-lg font-black text-red-100">{options.clipCount}</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm text-white/70"><span>Clips to generate</span><span>{options.clipCount}</span></div>
              <input type="range" min={1} max={10} value={options.clipCount} onChange={(e) => onChange({ ...options, clipCount: parseInt(e.target.value, 10) })} className="w-full accent-red-500" />
              <div className="mt-3 grid grid-cols-4 gap-2">
                {CLIP_LENGTHS.map((length) => (
                  <ChoiceCard key={length.value} active={options.clipLength === length.value} label={length.label} desc={length.desc} onClick={() => onChange({ ...options, clipLength: length.value })} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {DETECTION_MODES.map((mode) => (
                  <ChoiceCard key={mode.value} active={options.detectionMode === mode.value} label={mode.label} desc={mode.desc} onClick={() => onChange({ ...options, detectionMode: mode.value })} />
                ))}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-white/35">Keyword / priority detection</span>
                <textarea
                  value={options.priorityHint || ''}
                  maxLength={180}
                  onChange={(e) => onChange({ ...options, priorityHint: e.target.value })}
                  placeholder="Examples: clutch win, gunfights, funny rage, ship reveal, big rewards, boss fight"
                  className="min-h-[76px] w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-red-300">AI focus</h3>
            <p className="text-xs leading-5 text-white/40">Select all moment types the scorer should reward.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {AI_FOCUS_OPTIONS.map((focus) => (
              <ChoiceCard key={focus.value} active={options.aiFocus.includes(focus.value)} label={focus.label} desc={focus.desc} onClick={() => toggleFocus(focus.value)} />
            ))}
          </div>
          {options.aiFocus.length === 0 && <p className="mt-2 text-xs text-yellow-300">Select at least one focus type before processing.</p>}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-red-300">Subtitle choices</h3>
              <p className="text-xs leading-5 text-white/40">Pick the starting subtitle system here; every clip can still be fine-tuned after processing.</p>
            </div>
            <Toggle checked={subtitles.enabled} label={subtitles.enabled ? 'Subtitles On' : 'Subtitles Off'} onClick={() => updateSubtitles({ enabled: !subtitles.enabled })} />
          </div>

          {subtitles.enabled && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Automation presets</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {SUBTITLE_PRESETS.map((preset) => (
                    <ChoiceCard key={preset.value} active={(subtitles.preset || 'auto') === preset.value} label={preset.label} desc={preset.desc} onClick={() => onChange({ ...options, subtitles: applySubtitlePreset(subtitles, preset.value) })} />
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Caption mode</div>
                  <div className="grid grid-cols-2 gap-2">
                    {SUBTITLE_MODES.map((mode) => (
                      <ChoiceCard key={mode.value} active={(subtitles.mode || 'active_word') === mode.value} label={mode.label} desc={mode.desc} onClick={() => updateSubtitles({ mode: mode.value })} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Animation</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['pop', 'fade', 'none'] as SubtitleAnimationPreset[]).map((value) => (
                      <ChoiceCard key={value} active={(subtitles.animationPreset || 'pop') === value} label={value === 'none' ? 'None' : value[0].toUpperCase() + value.slice(1)} onClick={() => updateSubtitles({ animationPreset: value })} />
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {(['color', 'scale', 'pill', 'underline'] as ActiveWordStyle[]).map((value) => (
                      <ChoiceCard key={value} active={(subtitles.activeWordStyle || 'pill') === value} label={value[0].toUpperCase() + value.slice(1)} onClick={() => updateSubtitles({ activeWordStyle: value })} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block rounded-xl border border-white/10 bg-black/20 p-3">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-white/35">Font</span>
                  <select value={subtitles.font || 'impact'} onChange={(e) => updateSubtitles({ font: e.target.value as SubtitleFont })} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none">
                    {FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                  </select>
                </label>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Size</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as SubtitleSize[]).map((value) => <ChoiceCard key={value} active={(subtitles.size || 'medium') === value} label={value} onClick={() => updateSubtitles({ size: value })} />)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Position</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['bottom', 'center', 'top'] as const).map((value) => <ChoiceCard key={value} active={(subtitles.position || 'bottom') === value} label={value} onClick={() => updateSubtitles({ position: value })} />)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Safe zone</div>
                  <div className="grid grid-cols-4 gap-2">
                    {SAFE_ZONES.map((zone) => <ChoiceCard key={zone.value} active={(subtitles.safeZone || 'bottom_safe') === zone.value} label={zone.label} onClick={() => updateSubtitles({ safeZone: zone.value })} />)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Text case</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['upper', 'title', 'original'] as SubtitleCase[]).map((value) => <ChoiceCard key={value} active={(subtitles.textCase || 'original') === value} label={value === 'upper' ? 'UPPER' : value === 'title' ? 'Title' : 'Original'} onClick={() => updateSubtitles({ textCase: value })} />)}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block rounded-xl border border-white/10 bg-black/20 p-3">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-white/35">Text color</span>
                  <input type="color" value={subtitles.color || '#ffffff'} onChange={(e) => updateSubtitles({ color: e.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/40" />
                </label>
                <label className="block rounded-xl border border-white/10 bg-black/20 p-3">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-white/35">Keyword highlight</span>
                  <input type="color" value={subtitles.highlightColor || '#ffeb3b'} onChange={(e) => updateSubtitles({ highlightColor: e.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/40" />
                </label>
                <label className="block rounded-xl border border-white/10 bg-black/20 p-3">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-white/35">Outline color</span>
                  <input type="color" value={subtitles.outlineColor || '#000000'} onChange={(e) => updateSubtitles({ outlineColor: e.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/40" />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Outline</div>
                  <div className="grid grid-cols-4 gap-2">
                    {(['none', 'thin', 'medium', 'thick'] as NonNullable<SubtitleOptions['outlineThickness']>[]).map((value) => <ChoiceCard key={value} active={(subtitles.outlineThickness || 'medium') === value} label={value === 'none' ? 'Off' : value} onClick={() => updateSubtitles({ outlineThickness: value })} />)}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-white/35">Extras</div>
                  <div className="flex flex-wrap gap-2">
                    <Toggle checked={subtitles.shadow ?? true} label="Shadow" onClick={() => updateSubtitles({ shadow: !(subtitles.shadow ?? true) })} />
                    <Toggle checked={subtitles.watermarkEnabled ?? true} label="Watermark" onClick={() => updateSubtitles({ watermarkEnabled: !(subtitles.watermarkEnabled ?? true) })} />
                    <Toggle checked={subtitles.profanityFilter ?? false} label="Emoji censor" onClick={() => updateSubtitles({ profanityFilter: !(subtitles.profanityFilter ?? false) })} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <span className="mb-2 block text-sm font-bold text-white">Quality</span>
            <select value={options.outputQuality} onChange={(e) => onChange({ ...options, outputQuality: e.target.value as ProcessingOptions['outputQuality'] })} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none">
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
          <label className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <span className="mb-2 block text-sm font-bold text-white">Aspect ratio</span>
            <select value={options.platformFormat} onChange={(e) => onChange({ ...options, platformFormat: e.target.value as ProcessingOptions['platformFormat'] })} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none">
              <option value="twitter">16:9 Landscape (YouTube/Twitter)</option>
              <option value="tiktok">9:16 Vertical (TikTok/Reels/Shorts)</option>
              <option value="youtube_shorts">1:1 Square (Instagram)</option>
              <option value="custom">Original (no crop)</option>
            </select>
          </label>
        </section>

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
          <Button variant="primary" onClick={onConfirm} disabled={isSubmitting || options.aiFocus.length === 0} className="flex-1">
            {isSubmitting ? (
              <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Submitting...</span>
            ) : 'Start Processing'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
