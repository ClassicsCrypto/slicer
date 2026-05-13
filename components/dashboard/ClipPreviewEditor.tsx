'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ClipPlayer from '@/components/dashboard/ClipPlayer'
import Button from '@/components/ui/Button'
import {
  Clip,
  SubtitleAnimationPreset,
  SubtitleBackground,
  SubtitleCase,
  SubtitleFont,
  SubtitleMode,
  SubtitleOptions,
  SubtitlePreset,
  SubtitleSafeZone,
  SubtitleSize,
  SubtitleWord,
} from '@/types'

type SocialPlatform = 'x' | 'instagram' | 'tiktok' | 'youtube_shorts'
type ExportAspectRatio = 'twitter' | 'tiktok' | 'youtube_shorts' | 'custom'
type CaptionDraftMap = Partial<Record<SocialPlatform, string>>

interface TranscriptSegment {
  start: number
  end: number
  text: string
  wordStartIndex: number
  wordEndIndex: number
  wordCount: number
  endsWithManualBreak: boolean
}

interface ClipPreviewEditorProps {
  clip: Clip
  jobTitle: string
  sourceUrl: string
  subtitleOptions: SubtitleOptions
  exportAspectRatio?: ExportAspectRatio
  onSubtitleOptionsChange: (options: SubtitleOptions) => void
  onClipChange: (clip: Clip) => void
  onTrimChange: (start: number | null, end: number | null) => void
  onExportAspectRatioChange?: (ratio: ExportAspectRatio) => void
  children?: React.ReactNode
}

const FONT_OPTIONS: { value: SubtitleFont; label: string }[] = [
  { value: 'impact', label: 'Impact' },
  { value: 'bebas', label: 'Bebas Neue' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'sora', label: 'Sora' },
  { value: 'arial_black', label: 'Arial Black' },
  { value: 'trebuchet', label: 'Trebuchet' },
  { value: 'verdana', label: 'Verdana' },
  { value: 'georgia', label: 'Georgia' },
  { value: 'times_new_roman', label: 'Times New Roman' },
]

const PLATFORM_OPTIONS: { value: SocialPlatform; label: string }[] = [
  { value: 'x', label: 'X' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube_shorts', label: 'YouTube Shorts' },
]

const DEFAULT_SELECTED_PLATFORMS: SocialPlatform[] = []

const SUBTITLE_MODE_OPTIONS: { value: SubtitleMode; label: string; desc: string }[] = [
  { value: 'phrase', label: 'Phrase', desc: 'Classic chunked captions' },
  { value: 'active_word', label: 'Active Word', desc: 'Full phrase with current word highlighted' },
  { value: 'word_pop', label: 'Word Pop', desc: 'One word at a time' },
  { value: 'karaoke', label: 'Karaoke', desc: 'Sweep timing highlight' },
]

const ANIMATION_PRESET_OPTIONS: { value: SubtitleAnimationPreset; label: string; desc: string }[] = [
  { value: 'pop', label: 'Pop', desc: 'Punchy TikTok feel' },
  { value: 'fade', label: 'Fade', desc: 'Softer reveal' },
  { value: 'none', label: 'None', desc: 'Minimal motion' },
]

const OUTLINE_THICKNESS_OPTIONS: { value: NonNullable<SubtitleOptions['outlineThickness']>; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Med' },
  { value: 'thick', label: 'Thick' },
]

const SUBTITLE_BACKGROUND_OPTIONS: { value: SubtitleBackground; label: string; desc: string }[] = [
  { value: 'none', label: 'Off', desc: 'No caption background' },
  { value: 'solid', label: 'Box', desc: 'Solid readable caption box' },
  { value: 'rounded_box', label: 'Rounded', desc: 'Rounded caption container' },
  { value: 'blur', label: 'Blur', desc: 'Soft translucent backdrop' },
  { value: 'active_word_pill', label: 'Word Pill', desc: 'Background only behind active words' },
]

const TIMELINE_PX_PER_SECOND = 72
const TIMELINE_MIN_WIDTH = 900
const TIMELINE_SEGMENT_MIN_WIDTH = 60
const TIMELINE_SEGMENT_HEIGHT = 56
const TIMELINE_SEGMENT_ROW_GAP = 8
const TIMELINE_SEGMENT_STACK_GAP_PX = 8
const TIMELINE_TRACK_PADDING_Y = 12
const MIN_SEGMENT_DURATION = 0.35
const MIN_SEGMENT_GAP = 0.05
const DEFAULT_TEXT_COLOR = '#ffffff'
const DEFAULT_OUTLINE_COLOR = '#000000'
const DEFAULT_HIGHLIGHT_COLOR = '#ffeb3b'
const DEFAULT_BACKGROUND_COLOR = '#000000'
const DEFAULT_BACKGROUND_OPACITY = 45
const BRAND_KIT_STORAGE_KEY = 'slicer.subtitleBrandKit.v1'

const SUBTITLE_PRESETS: { value: SubtitlePreset; label: string; desc: string; options: Partial<SubtitleOptions> }[] = [
  { value: 'auto', label: 'Auto', desc: 'Slicer picks the safest creator-ready default', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'impact', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'pill', textCase: 'original' } },
  { value: 'clean_tiktok', label: 'Clean TikTok', desc: 'Native-looking white text with strong outline', options: { mode: 'phrase', safeZone: 'bottom_safe', font: 'montserrat', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'medium', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'fade', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'gaming_pop', label: 'Gaming Pop', desc: 'Big punchy action captions', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'impact', size: 'large', color: '#ffffff', highlightColor: '#ff3b30', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'upper' } },
  { value: 'hormozi_highlight', label: 'Hormozi Highlight', desc: 'Phrase captions with active keyword emphasis', options: { mode: 'active_word', safeZone: 'center_safe', font: 'arial_black', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'pop', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'mcv_branded', label: 'MCV Branded', desc: 'Mars Cats red highlight and watermark-ready', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'sora', size: 'medium', color: '#ffffff', highlightColor: '#ff4d4d', outlineThickness: 'thick', outlineColor: '#050505', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'pop', activeWordStyle: 'pill', textCase: 'original', watermarkEnabled: true } },
  { value: 'meme_bold', label: 'Meme Bold', desc: 'Loud all-caps punchline style', options: { mode: 'word_pop', safeZone: 'center_safe', font: 'impact', size: 'large', color: '#ffffff', highlightColor: '#00e5ff', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'pop', activeWordStyle: 'scale', textCase: 'upper' } },
  { value: 'minimal_white', label: 'Minimal White', desc: 'Small clean captions for dialogue-heavy clips', options: { mode: 'phrase', safeZone: 'upper_safe', font: 'montserrat', size: 'small', color: '#ffffff', highlightColor: '#ffffff', outlineThickness: 'thin', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'fade', activeWordStyle: 'color', textCase: 'original' } },
]

const SAFE_ZONE_OPTIONS: { value: SubtitleSafeZone; label: string; desc: string }[] = [
  { value: 'bottom_safe', label: 'Bottom Safe', desc: 'Above app UI and captions' },
  { value: 'center_safe', label: 'Center', desc: 'Middle creator-caption style' },
  { value: 'upper_safe', label: 'Upper Safe', desc: 'Keeps gameplay HUD clear' },
  { value: 'auto', label: 'Auto', desc: 'Use preset default' },
]

const PLATFORM_EXPORT_FORMAT: Record<SocialPlatform, ExportAspectRatio> = {
  x: 'twitter',
  instagram: 'tiktok',
  tiktok: 'tiktok',
  youtube_shorts: 'tiktok',
}

const PLATFORM_PUBLISH_GUIDE: Record<SocialPlatform, {
  label: string
  exportLabel: string
  composerLabel: string
  futureFlow: string
  launchNote: string
  checklist: string[]
}> = {
  x: {
    label: 'X',
    exportLabel: '16:9 landscape',
    composerLabel: 'X post composer',
    futureFlow: 'Open X in a new tab, attach the rendered clip, inject the caption, then stop on the final post approval.',
    launchNote: 'Premium launch target. Best first platform because the composer flow is lighter than the others.',
    checklist: [
      'Open the live composer in a new tab.',
      'Attach the rendered clip automatically.',
      'Fill the caption and pause for final approval.',
    ],
  },
  instagram: {
    label: 'Instagram',
    exportLabel: '9:16 vertical',
    composerLabel: 'Instagram Reel upload',
    futureFlow: 'Open Instagram’s Reel flow, upload the vertical clip, prefill the caption, and leave the final share click to the user.',
    launchNote: 'Premium public-launch target. This likely needs heavier browser automation than X or YouTube.',
    checklist: [
      'Open the Reel uploader in a new tab.',
      'Attach the vertical render automatically.',
      'Prefill the caption and stop before publish.',
    ],
  },
  tiktok: {
    label: 'TikTok',
    exportLabel: '9:16 vertical',
    composerLabel: 'TikTok upload flow',
    futureFlow: 'Open TikTok upload in a new tab, drop in the clip, inject the caption, and hand the final review back to the user.',
    launchNote: 'Premium public-launch target. Good second-wave candidate once X and YouTube feel solid.',
    checklist: [
      'Open the upload flow in a new tab.',
      'Attach the vertical render automatically.',
      'Fill the caption and pause on final approval.',
    ],
  },
  youtube_shorts: {
    label: 'YouTube Shorts',
    exportLabel: '9:16 vertical',
    composerLabel: 'YouTube Shorts upload',
    futureFlow: 'Open YouTube Studio Shorts upload, attach the clip, prefill the title/caption, then stop for the final visibility and publish check.',
    launchNote: 'Premium launch target. Good early platform because the upload surface is structured and predictable.',
    checklist: [
      'Open YouTube Studio in a new tab.',
      'Attach the Shorts render automatically.',
      'Prefill title/caption and stop before publish.',
    ],
  },
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function applySubtitlePreset(current: SubtitleOptions, preset: SubtitlePreset): SubtitleOptions {
  const selected = SUBTITLE_PRESETS.find((entry) => entry.value === preset) || SUBTITLE_PRESETS[0]
  return {
    ...current,
    ...selected.options,
    preset,
    enabled: current.enabled,
  }
}

function getAutomatedSubtitlePreset(clip: Clip): SubtitlePreset {
  const categories = clip.matched_categories || []
  if (categories.some((category) => ['kill_streaks', 'intense_action', 'big_plays', 'hype_moments'].includes(category))) return 'gaming_pop'
  if (categories.some((category) => ['funny_moments', 'fails', 'reactions'].includes(category))) return 'meme_bold'
  if (categories.some((category) => ['key_dialogue'].includes(category))) return 'clean_tiktok'
  if ((clip.virality_score || 0) >= 8) return 'hormozi_highlight'
  return 'mcv_branded'
}

function tuneCaptionsForClip(current: SubtitleOptions, clip: Clip): SubtitleOptions {
  const preset = getAutomatedSubtitlePreset(clip)
  return {
    ...applySubtitlePreset(current, preset),
    autoKeywords: true,
    safeZone: preset === 'meme_bold' ? 'center_safe' : 'bottom_safe',
  }
}

function loadBrandKit(): Partial<SubtitleOptions> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(BRAND_KIT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function saveBrandKit(options: SubtitleOptions) {
  if (typeof window === 'undefined') return
  const kit: Partial<SubtitleOptions> = {
    brandKitName: 'Saved Brand Kit',
    preset: options.preset,
    mode: options.mode,
    safeZone: options.safeZone,
    font: options.font,
    size: options.size,
    color: options.color,
    highlightColor: options.highlightColor,
    outlineColor: options.outlineColor,
    outlineThickness: options.outlineThickness,
    background: options.background,
    backgroundColor: options.backgroundColor,
    backgroundOpacity: options.backgroundOpacity,
    shadow: options.shadow,
    animationPreset: options.animationPreset,
    activeWordStyle: options.activeWordStyle,
    textCase: options.textCase,
    watermarkEnabled: options.watermarkEnabled,
    profanityFilter: options.profanityFilter,
  }
  window.localStorage.setItem(BRAND_KIT_STORAGE_KEY, JSON.stringify(kit))
}

function formatTimestamp(seconds: number, showTenths = false) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (!showTenths) return `${mins}:${secs.toString().padStart(2, '0')}`
  const tenths = Math.floor((seconds % 1) * 10)
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`
}

function getScoreLabel(score?: number) {
  if (!score) return 'Unrated'
  if (score >= 9) return 'Elite'
  if (score >= 8) return 'Strong'
  if (score >= 6) return 'Usable'
  if (score >= 4) return 'Okay'
  return 'Low'
}

function getScoreClass(score?: number) {
  if (!score) return 'text-white/50 border-white/15 bg-white/5'
  if (score >= 8) return 'text-red-300 border-red-500/30 bg-red-500/10'
  if (score >= 6) return 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
  return 'text-white/70 border-white/15 bg-white/5'
}

function cleanClipReason(reason?: string) {
  const cleaned = (reason || '')
    .replace(/^reason\s*[:\-]\s*/i, '')
    .replace(/^this clip was selected because\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return 'Selected by the scorer.'
  return cleaned[0].toUpperCase() + cleaned.slice(1)
}

function getClipTranscriptText(clip: Clip) {
  return normalizeSubtitleWords(clip.subtitles ?? [])
    .map((word) => word.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSubtitleWords(words: SubtitleWord[] = []) {
  return [...words]
    .filter((word) => typeof word?.start === 'number' && typeof word?.end === 'number' && typeof word?.text === 'string')
    .sort((a, b) => (a.start - b.start) || (a.end - b.end))
}

function buildTranscriptSegments(clip: Clip): TranscriptSegment[] {
  const subtitles = normalizeSubtitleWords(clip.subtitles ?? [])
  if (subtitles.length === 0) return []

  const segments: TranscriptSegment[] = []
  let cursor = 0

  while (cursor < subtitles.length) {
    const startIndex = cursor
    const chunk: typeof subtitles = [subtitles[cursor]]
    cursor += 1

    while (cursor < subtitles.length && chunk.length < 6) {
      const previous = chunk[chunk.length - 1]
      const next = subtitles[cursor]
      const gap = next.start - previous.end
      const duration = next.end - chunk[0].start
      if (previous.breakAfter || gap > 0.75 || duration > 3.2) break
      chunk.push(next)
      cursor += 1
    }

    segments.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((word) => word.text).join(' '),
      wordStartIndex: startIndex,
      wordEndIndex: startIndex + chunk.length - 1,
      wordCount: chunk.length,
      endsWithManualBreak: Boolean(chunk[chunk.length - 1]?.breakAfter),
    })
  }

  return segments
}

function replaceTranscriptSegment(clip: Clip, segment: TranscriptSegment, draft: string): Clip {
  const subtitles = normalizeSubtitleWords(clip.subtitles ?? [])
  if (subtitles.length === 0) return clip

  const updatedText = draft.trim().replace(/\s+/g, ' ')
  if (!updatedText) return clip

  const replacementWords = updatedText.split(' ')
  const before = subtitles.slice(0, segment.wordStartIndex)
  const after = subtitles.slice(segment.wordEndIndex + 1)
  const previousBoundary = before[before.length - 1]?.end ?? 0
  const nextBoundary = after[0]?.start ?? Math.max(clip.duration || 0, clip.end_time - clip.start_time, segment.end)
  const currentDuration = Math.max(0.1, segment.end - segment.start)
  const targetDuration = Math.min(
    nextBoundary - previousBoundary - MIN_SEGMENT_GAP * 2,
    Math.max(currentDuration, replacementWords.length * 0.34),
  )

  let nextStart = segment.start
  let nextEnd = segment.end
  let extraNeeded = Math.max(0, targetDuration - currentDuration)

  if (extraNeeded > 0) {
    const roomOnRight = Math.max(0, nextBoundary - MIN_SEGMENT_GAP - segment.end)
    const extendRight = Math.min(roomOnRight, extraNeeded)
    nextEnd += extendRight
    extraNeeded -= extendRight

    if (extraNeeded > 0) {
      const roomOnLeft = Math.max(0, segment.start - (previousBoundary + MIN_SEGMENT_GAP))
      const extendLeft = Math.min(roomOnLeft, extraNeeded)
      nextStart -= extendLeft
      extraNeeded -= extendLeft
    }
  }

  const totalDuration = Math.max(0.1, nextEnd - nextStart)
  const step = totalDuration / replacementWords.length

  const replacement = replacementWords.map((text, index) => ({
    text,
    start: parseFloat((nextStart + step * index).toFixed(2)),
    end: parseFloat((nextStart + step * (index + 1)).toFixed(2)),
    breakAfter: index === replacementWords.length - 1 && subtitles[segment.wordEndIndex]?.breakAfter ? true : undefined,
  }))

  return {
    ...clip,
    subtitles: [...before, ...replacement, ...after],
  }
}

function retimeTranscriptSegment(clip: Clip, segment: TranscriptSegment, nextStart: number, nextEnd: number): Clip {
  const subtitles = normalizeSubtitleWords(clip.subtitles ?? [])
  if (subtitles.length === 0) return clip

  const targetWords = subtitles.slice(segment.wordStartIndex, segment.wordEndIndex + 1)
  if (targetWords.length === 0) return clip

  const before = subtitles.slice(0, segment.wordStartIndex)
  const after = subtitles.slice(segment.wordEndIndex + 1)
  const previousBoundary = before[before.length - 1]?.end ?? 0
  const nextBoundary = after[0]?.start ?? Math.max(clip.duration || 0, clip.end_time - clip.start_time, nextEnd)
  const safeStart = clamp(nextStart, previousBoundary + MIN_SEGMENT_GAP, nextBoundary - MIN_SEGMENT_DURATION)
  const safeEnd = clamp(nextEnd, safeStart + MIN_SEGMENT_DURATION, nextBoundary - MIN_SEGMENT_GAP)
  const availableDuration = Math.max(MIN_SEGMENT_DURATION, safeEnd - safeStart)
  const weights = targetWords.map((word) => Math.max(0.08, word.end - word.start))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || targetWords.length

  let cursor = safeStart
  const replacement = targetWords.map((word, index) => {
    const remainingWords = targetWords.length - index - 1
    const proportionalDuration = index === targetWords.length - 1
      ? safeEnd - cursor
      : Math.max(0.08, (weights[index] / totalWeight) * availableDuration)
    const maxEnd = safeEnd - remainingWords * 0.08
    const start = parseFloat(cursor.toFixed(2))
    const end = parseFloat(clamp(cursor + proportionalDuration, start + 0.08, maxEnd).toFixed(2))
    cursor = end
    return {
      ...word,
      start,
      end: index === targetWords.length - 1 ? parseFloat(safeEnd.toFixed(2)) : end,
    }
  })

  return {
    ...clip,
    subtitles: [...before, ...replacement, ...after],
  }
}

function updateManualSegmentBreak(clip: Clip, wordIndex: number, enabled: boolean): Clip {
  const subtitles = normalizeSubtitleWords(clip.subtitles ?? [])
  if (wordIndex < 0 || wordIndex >= subtitles.length) return clip

  return {
    ...clip,
    subtitles: subtitles.map((word, index) => (
      index === wordIndex
        ? { ...word, breakAfter: enabled || undefined }
        : word
    )),
  }
}

function getSegmentSplitWordIndex(clip: Clip, segment: TranscriptSegment, playheadTime: number) {
  const subtitles = normalizeSubtitleWords(clip.subtitles ?? [])
  const words = subtitles.slice(segment.wordStartIndex, segment.wordEndIndex + 1)
  if (words.length < 2) return null

  let relativeIndex = Math.max(0, Math.floor(words.length / 2) - 1)
  for (let index = 0; index < words.length - 1; index += 1) {
    const current = words[index]
    const next = words[index + 1]
    const boundaryMidpoint = current.end + ((next.start - current.end) / 2)
    relativeIndex = index
    if (playheadTime <= boundaryMidpoint) break
  }

  return segment.wordStartIndex + relativeIndex
}

export default function ClipPreviewEditor({
  clip,
  jobTitle,
  sourceUrl,
  subtitleOptions,
  exportAspectRatio,
  onSubtitleOptionsChange,
  onClipChange,
  onTrimChange,
  onExportAspectRatioChange,
  children,
}: ClipPreviewEditorProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(DEFAULT_SELECTED_PLATFORMS)
  const [postDrafts, setPostDrafts] = useState<CaptionDraftMap>({})
  const [postLoading, setPostLoading] = useState(false)
  const [copiedDraftKey, setCopiedDraftKey] = useState<string | null>(null)
  const [preferredExportPlatform, setPreferredExportPlatform] = useState<SocialPlatform>('x')
  const [selectedPublishPlatform, setSelectedPublishPlatform] = useState<SocialPlatform | null>(null)
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null)
  const [segmentDraft, setSegmentDraft] = useState('')
  const [playheadTime, setPlayheadTime] = useState(0)
  const [externalSeekTime, setExternalSeekTime] = useState<number | null>(0)
  const [brandKitAvailable, setBrandKitAvailable] = useState(false)
  const [brandKitSaved, setBrandKitSaved] = useState(false)
  const [segmentBoundsDraft, setSegmentBoundsDraftState] = useState<{ start: number; end: number } | null>(null)
  const segmentBoundsDraftRef = useRef<{ start: number; end: number } | null>(null)
  const timelineViewportRef = useRef<HTMLDivElement>(null)

  const setSegmentBoundsDraft = (next: { start: number; end: number } | null) => {
    segmentBoundsDraftRef.current = next
    setSegmentBoundsDraftState(next)
  }

  const transcriptSegments = useMemo(() => buildTranscriptSegments(clip), [clip])
  const orderedSubtitles = useMemo(() => normalizeSubtitleWords(clip.subtitles ?? []), [clip.subtitles])
  const orderedSelectedPlatforms = useMemo(
    () => PLATFORM_OPTIONS.map((option) => option.value).filter((platform) => selectedPlatforms.includes(platform)),
    [selectedPlatforms],
  )
  const clipTranscript = useMemo(() => getClipTranscriptText(clip), [clip])
  const selectedSegment = selectedSegmentIndex !== null ? transcriptSegments[selectedSegmentIndex] : null
  const effectiveDuration = Number.isFinite(clip.duration)
    ? clip.duration
    : Math.max(0, clip.end_time - clip.start_time)
  const timelineDuration = Math.max(
    effectiveDuration,
    transcriptSegments[transcriptSegments.length - 1]?.end ?? effectiveDuration,
  )
  const timelineWidth = Math.max(TIMELINE_MIN_WIDTH, Math.ceil(timelineDuration * TIMELINE_PX_PER_SECOND))

  const gapMarkers = useMemo(() => {
    return transcriptSegments.slice(1).map((segment, index) => {
      const previous = transcriptSegments[index]
      const gapStart = previous.end
      const gapEnd = segment.start
      const gapDuration = gapEnd - gapStart
      if (gapDuration < 0.65) return null
      return { start: gapStart, end: gapEnd, duration: gapDuration }
    }).filter(Boolean) as { start: number; end: number; duration: number }[]
  }, [transcriptSegments])
  const stackedTimelineSegments = useMemo(() => {
    const laneRightEdges: number[] = []

    return transcriptSegments.map((segment, index) => {
      const isSelected = selectedSegmentIndex === index
      const bounds = isSelected && segmentBoundsDraft ? segmentBoundsDraft : { start: segment.start, end: segment.end }
      const left = bounds.start * TIMELINE_PX_PER_SECOND
      const width = Math.max(TIMELINE_SEGMENT_MIN_WIDTH, (bounds.end - bounds.start) * TIMELINE_PX_PER_SECOND)

      let lane = 0
      while (laneRightEdges[lane] !== undefined && left < laneRightEdges[lane]) {
        lane += 1
      }
      laneRightEdges[lane] = left + width + TIMELINE_SEGMENT_STACK_GAP_PX

      return {
        segment,
        index,
        isSelected,
        bounds,
        left,
        width,
        lane,
      }
    })
  }, [transcriptSegments, selectedSegmentIndex, segmentBoundsDraft])
  const timelineLaneCount = Math.max(1, stackedTimelineSegments.reduce((max, item) => Math.max(max, item.lane + 1), 1))
  const timelineTrackHeight = Math.max(
    96,
    (TIMELINE_TRACK_PADDING_Y * 2) + (timelineLaneCount * TIMELINE_SEGMENT_HEIGHT) + (Math.max(0, timelineLaneCount - 1) * TIMELINE_SEGMENT_ROW_GAP),
  )
  const selectedSegmentLastWord = selectedSegment ? orderedSubtitles[selectedSegment.wordEndIndex] : null
  const canMergeNextSegment = Boolean(selectedSegmentLastWord?.breakAfter)
  const canSplitSelectedSegment = Boolean(selectedSegment && selectedSegment.wordCount > 1)

  useEffect(() => {
    setBrandKitAvailable(Boolean(loadBrandKit()))
  }, [])

  useEffect(() => {
    setSelectedSegmentIndex(null)
    setSegmentDraft('')
    setSegmentBoundsDraft(null)
    setCopiedDraftKey(null)
    setSelectedPublishPlatform(null)
    setPlayheadTime(0)
    setExternalSeekTime(0)
  }, [clip.id])

  useEffect(() => {
    if (!selectedSegment) {
      setSegmentDraft('')
      setSegmentBoundsDraft(null)
      return
    }
    setSegmentDraft(selectedSegment.text)
    setSegmentBoundsDraft({ start: selectedSegment.start, end: selectedSegment.end })
  }, [selectedSegment])

  useEffect(() => {
    if (!orderedSelectedPlatforms.length) return
    if (exportAspectRatio && exportAspectRatio !== 'custom') return
    const anchorPlatform = preferredExportPlatform || orderedSelectedPlatforms[0]
    onExportAspectRatioChange?.(PLATFORM_EXPORT_FORMAT[anchorPlatform])
  }, [exportAspectRatio, onExportAspectRatioChange, orderedSelectedPlatforms, preferredExportPlatform])

  const queueSeek = (nextTime: number) => {
    const clampedTime = clamp(nextTime, 0, timelineDuration)
    setPlayheadTime(clampedTime)
    setExternalSeekTime((previous) => previous === clampedTime ? clampedTime + 0.0001 : clampedTime)
  }

  const togglePlatform = (platform: SocialPlatform) => {
    setSelectedPlatforms((current) => {
      const isRemoving = current.includes(platform)
      const next = isRemoving
        ? current.filter((value) => value !== platform)
        : [...current, platform]

      const nextPreferred = isRemoving
        ? (preferredExportPlatform === platform ? next[next.length - 1] ?? null : preferredExportPlatform)
        : platform

      if (nextPreferred) {
        setPreferredExportPlatform(nextPreferred)
        onExportAspectRatioChange?.(PLATFORM_EXPORT_FORMAT[nextPreferred])
      }

      return next
    })
  }

  const scrollTimelineTo = (time: number) => {
    const viewport = timelineViewportRef.current
    if (!viewport) return
    const targetLeft = time * TIMELINE_PX_PER_SECOND - viewport.clientWidth / 2
    viewport.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' })
  }

  const getTimelineTimeFromClientX = (clientX: number) => {
    const viewport = timelineViewportRef.current
    if (!viewport) return 0
    const rect = viewport.getBoundingClientRect()
    const x = clientX - rect.left + viewport.scrollLeft
    return clamp(x / TIMELINE_PX_PER_SECOND, 0, timelineDuration)
  }

  const startTimelineScrub = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const seekTo = (clientX: number) => {
      const time = getTimelineTimeFromClientX(clientX)
      queueSeek(time)
    }

    seekTo(event.clientX)

    const onMove = (moveEvent: MouseEvent) => seekTo(moveEvent.clientX)
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const startSegmentResize = (event: React.MouseEvent<HTMLDivElement>, edge: 'start' | 'end') => {
    event.preventDefault()
    event.stopPropagation()
    if (!selectedSegment || selectedSegmentIndex === null) return

    const previousSegment = transcriptSegments[selectedSegmentIndex - 1]
    const nextSegment = transcriptSegments[selectedSegmentIndex + 1]
    const baseSegment = selectedSegment

    const onMove = (moveEvent: MouseEvent) => {
      const draggedTime = getTimelineTimeFromClientX(moveEvent.clientX)
      const currentBounds = segmentBoundsDraftRef.current ?? { start: baseSegment.start, end: baseSegment.end }
      if (edge === 'start') {
        const nextStart = clamp(
          draggedTime,
          previousSegment ? previousSegment.end + MIN_SEGMENT_GAP : 0,
          currentBounds.end - MIN_SEGMENT_DURATION,
        )
        setSegmentBoundsDraft({ start: nextStart, end: currentBounds.end })
      } else {
        const nextEnd = clamp(
          draggedTime,
          currentBounds.start + MIN_SEGMENT_DURATION,
          nextSegment ? nextSegment.start - MIN_SEGMENT_GAP : timelineDuration,
        )
        setSegmentBoundsDraft({ start: currentBounds.start, end: nextEnd })
      }
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const nextBounds = segmentBoundsDraftRef.current
      if (!nextBounds) return
      const updatedClip = retimeTranscriptSegment(clip, baseSegment, nextBounds.start, nextBounds.end)
      onClipChange(updatedClip)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handlePreparePost = async () => {
    if (orderedSelectedPlatforms.length === 0) return

    setPostLoading(true)
    try {
      const transcript = clipTranscript || clip.ai_reason
      const res = await fetch('/api/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          categories: clip.matched_categories,
          title: jobTitle,
          duration: effectiveDuration,
          platform: orderedSelectedPlatforms[0],
          platforms: orderedSelectedPlatforms,
          reason: clip.ai_reason,
          score: clip.virality_score,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to prepare post')

      const nextDrafts = typeof data?.drafts === 'object' && data.drafts
        ? orderedSelectedPlatforms.reduce<CaptionDraftMap>((acc, platform) => {
            const draft = typeof data.drafts?.[platform] === 'string' ? data.drafts[platform] : ''
            if (draft) acc[platform] = draft
            return acc
          }, {})
        : {
            [orderedSelectedPlatforms[0]]: data.caption || data.post || '',
          }

      setPostDrafts((current) => ({ ...current, ...nextDrafts }))
      setCopiedDraftKey(null)
    } catch (error) {
      const fallbackDraft = `Could not prepare a post automatically.\n\n${cleanClipReason(clip.ai_reason)}`
      setPostDrafts((current) => ({
        ...current,
        ...orderedSelectedPlatforms.reduce<CaptionDraftMap>((acc, platform) => {
          acc[platform] = fallbackDraft
          return acc
        }, {}),
      }))
    } finally {
      setPostLoading(false)
    }
  }

  const handleCopyPost = async (platform: SocialPlatform | 'all') => {
    const text = platform === 'all'
      ? orderedSelectedPlatforms
          .filter((value) => postDrafts[value])
          .map((value) => `# ${PLATFORM_OPTIONS.find((option) => option.value === value)?.label || value}\n${postDrafts[value]}`)
          .join('\n\n')
      : (postDrafts[platform] ?? '')

    if (!text) return

    await navigator.clipboard.writeText(text)
    setCopiedDraftKey(platform)
    setTimeout(() => setCopiedDraftKey(null), 2000)
  }

  const handleOpenPublishPlaceholder = (platform: SocialPlatform) => {
    setSelectedPublishPlatform(platform)
    setPreferredExportPlatform(platform)
    onExportAspectRatioChange?.(PLATFORM_EXPORT_FORMAT[platform])
  }

  const handleApplyTranscriptEdit = () => {
    if (!selectedSegment) return
    const updatedClip = replaceTranscriptSegment(clip, selectedSegment, segmentDraft)
    onClipChange(updatedClip)
    queueSeek(segmentBoundsDraft?.start ?? selectedSegment.start)
  }

  const handleSplitSegmentAtPlayhead = () => {
    if (!selectedSegment) return
    const splitWordIndex = getSegmentSplitWordIndex(clip, selectedSegment, playheadTime)
    if (splitWordIndex === null) return

    const updatedClip = updateManualSegmentBreak(clip, splitWordIndex, true)
    onClipChange(updatedClip)
    setSegmentBoundsDraft(null)
  }

  const handleMergeNextSegment = () => {
    if (!selectedSegment) return
    const updatedClip = updateManualSegmentBreak(clip, selectedSegment.wordEndIndex, false)
    onClipChange(updatedClip)
    setSegmentBoundsDraft(null)
  }

  const handleSaveBrandKit = () => {
    saveBrandKit(subtitleOptions)
    setBrandKitAvailable(true)
    setBrandKitSaved(true)
    setTimeout(() => setBrandKitSaved(false), 1800)
  }

  const handleApplyBrandKit = () => {
    const kit = loadBrandKit()
    if (!kit) return
    onSubtitleOptionsChange({ ...subtitleOptions, ...kit })
  }

  const subtitleTextColor = subtitleOptions.color && subtitleOptions.color !== 'custom'
    ? subtitleOptions.color
    : (subtitleOptions.customColor ?? DEFAULT_TEXT_COLOR)
  const subtitleOutlineColor = subtitleOptions.outlineColor && subtitleOptions.outlineColor !== 'custom'
    ? subtitleOptions.outlineColor
    : (subtitleOptions.customOutlineColor ?? DEFAULT_OUTLINE_COLOR)
  const subtitleHighlightColor = subtitleOptions.highlightColor || DEFAULT_HIGHLIGHT_COLOR
  const subtitleBackgroundColor = subtitleOptions.backgroundColor && subtitleOptions.backgroundColor !== 'custom'
    ? subtitleOptions.backgroundColor
    : (subtitleOptions.customBackgroundColor ?? DEFAULT_BACKGROUND_COLOR)
  const subtitleBackgroundOpacity = Math.max(0, Math.min(100, subtitleOptions.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY))
  const backgroundEnabled = (subtitleOptions.background || 'none') !== 'none'
  const outlineEnabled = (subtitleOptions.outlineThickness || 'medium') !== 'none'
  const sharedChoiceButtonClass = (active: boolean, extra = '') => (
    `rounded-lg border transition-all ${active ? 'border-red-500/30 bg-red-500/10 text-white' : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20 hover:text-white/90'} ${extra}`
  )
  const sharedSectionLabelClass = 'text-[11px] font-semibold uppercase tracking-wide text-white/35'
  const compactButtonClass = (active: boolean, extra = '') => sharedChoiceButtonClass(active, `h-10 px-3 text-sm font-semibold ${extra}`)

  const subtitleStylingPanel = (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h4 className="text-2xl font-semibold text-white">Subtitle Styling</h4>
          <p className="text-sm leading-6 text-white/42">Per-clip subtitle state, dynamic mode, stronger animations, and export styling.</p>
        </div>

        <button
          onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, enabled: !subtitleOptions.enabled })}
          className={`inline-flex h-11 items-center gap-2.5 self-start rounded-full border px-4 text-base font-semibold transition-all ${subtitleOptions.enabled ? 'border-red-500/30 bg-red-500/10 text-white' : 'border-white/10 bg-black/20 text-white/60'}`}
        >
          <span className={`h-3 w-3 rounded-full ${subtitleOptions.enabled ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.72)]' : 'bg-white/20'}`} />
          {subtitleOptions.enabled ? 'Subtitles On' : 'Subtitles Off'}
        </button>
      </div>

      {!subtitleOptions.enabled && (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-white/45">
          This clip will export without subtitles unless you turn them back on.
        </div>
      )}

      {subtitleOptions.enabled && (
        <div className="rounded-xl border border-red-500/15 bg-red-500/[0.06] p-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h5 className="text-sm font-semibold text-white">Automation-first presets</h5>
              <p className="mt-1 text-xs leading-5 text-white/38">Let Slicer pick a caption style by clip type, or save/apply a reusable brand kit. Manual controls stay available below.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, profanityFilter: !subtitleOptions.profanityFilter })}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-all ${subtitleOptions.profanityFilter ? 'border-yellow-300/35 bg-yellow-300/12 text-yellow-100' : 'border-white/10 bg-black/20 text-white/60 hover:border-white/20 hover:text-white'}`}
                title="Replace detected curse words with emojis in subtitle preview/export."
              >
                {subtitleOptions.profanityFilter ? '🤬→😼 Emoji Censor On' : '🤬 Emoji Censor Off'}
              </button>
              <Button variant="primary" onClick={() => onSubtitleOptionsChange(tuneCaptionsForClip(subtitleOptions, clip))}>Auto Tune This Clip</Button>
              <Button variant="ghost" onClick={handleSaveBrandKit}>{brandKitSaved ? 'Saved' : 'Save Brand Kit'}</Button>
              <Button variant="secondary" onClick={handleApplyBrandKit} disabled={!brandKitAvailable}>Apply Brand Kit</Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {SUBTITLE_PRESETS.map((preset) => {
              const active = (subtitleOptions.preset || 'auto') === preset.value
              return (
                <button
                  key={preset.value}
                  onClick={() => onSubtitleOptionsChange(applySubtitlePreset(subtitleOptions, preset.value))}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-all ${active ? 'border-red-500/40 bg-red-500/15 text-white' : 'border-white/10 bg-black/20 text-white/60 hover:border-white/25 hover:text-white'}`}
                  title={preset.desc}
                >
                  <div className="text-sm font-semibold">{preset.label}</div>
                  <div className="mt-1 text-[11px] leading-4 text-white/35">{preset.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {subtitleOptions.enabled && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3 min-w-0">
                <label className={`block ${sharedSectionLabelClass}`}>Subtitle Mode</label>
                <div className="grid gap-3">
                  {SUBTITLE_MODE_OPTIONS.map((option) => {
                    const active = (subtitleOptions.mode || 'phrase') === option.value
                    return (
                      <button
                        key={option.value}
                        onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, mode: option.value })}
                        className={compactButtonClass(active, 'min-w-0 text-left')}
                        title={option.desc}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-3 min-w-0">
                <label className={`block ${sharedSectionLabelClass}`}>Animation</label>
                <div className="grid gap-3">
                  {ANIMATION_PRESET_OPTIONS.map((option) => {
                    const active = (subtitleOptions.animationPreset || 'none') === option.value
                    return (
                      <button
                        key={option.value}
                        onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, animationPreset: option.value })}
                        className={compactButtonClass(active, 'min-w-0 text-left')}
                        title={option.desc}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
              <div className="space-y-6 min-w-0">
                <div className="space-y-3">
                  <label className={`block ${sharedSectionLabelClass}`}>Font</label>
                  <div className="relative">
                    <select
                      value={subtitleOptions.font || 'impact'}
                      onChange={(e) => onSubtitleOptionsChange({ ...subtitleOptions, font: e.target.value as SubtitleFont })}
                      className="h-12 w-full appearance-none rounded-lg border border-red-500/30 bg-black/20 px-4 pr-12 text-base font-semibold text-white focus:border-red-500 focus:outline-none"
                    >
                      {FONT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-white/55">⌄</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className={`block ${sharedSectionLabelClass}`}>Size</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['small', 'medium', 'large'] as SubtitleSize[]).map((value) => (
                      <button
                        key={value}
                        onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, size: value })}
                        className={compactButtonClass((subtitleOptions.size || 'medium') === value, 'leading-none')}
                      >
                        {value[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6 min-w-0">
                <div className="space-y-3">
                  <label className={`block ${sharedSectionLabelClass}`}>Safe Zone</label>
                  <div className="grid grid-cols-2 gap-3">
                    {SAFE_ZONE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => onSubtitleOptionsChange({
                          ...subtitleOptions,
                          safeZone: option.value,
                          position: option.value === 'upper_safe' ? 'top' : option.value === 'center_safe' ? 'center' : 'bottom',
                        })}
                        className={compactButtonClass((subtitleOptions.safeZone || 'bottom_safe') === option.value, 'min-w-0 text-left')}
                        title={option.desc}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-3 min-w-0">
                    <label className={`block ${sharedSectionLabelClass}`}>Letter Case</label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['upper', 'title', 'original'] as SubtitleCase[]).map((value) => (
                        <button
                          key={value}
                          onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, textCase: value })}
                          className={compactButtonClass((subtitleOptions.textCase || 'original') === value, 'min-w-0')}
                        >
                          {value === 'upper' ? 'ABC' : value === 'title' ? 'Abc' : 'abc'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 min-w-0">
                    <label className={`block ${sharedSectionLabelClass}`}>Shadow</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'On', enabled: true },
                        { label: 'Off', enabled: false },
                      ].map((option) => (
                        <button
                          key={option.label}
                          onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, shadow: option.enabled })}
                          className={compactButtonClass((subtitleOptions.shadow ?? true) === option.enabled)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="space-y-3 xl:pt-6">
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <label className={`mb-3 block ${sharedSectionLabelClass}`}>Text Color</label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={subtitleTextColor}
                  onChange={(e) => onSubtitleOptionsChange({ ...subtitleOptions, color: e.target.value })}
                  className="h-12 w-16 cursor-pointer rounded-md border border-white/10 bg-transparent p-1"
                />
                <div>
                  <div className="text-base font-semibold text-white">{subtitleTextColor.toUpperCase()}</div>
                  <div className="text-sm leading-5 text-white/40">Pick any text color</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <label className={`mb-3 block ${sharedSectionLabelClass}`}>Active Word Color</label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={subtitleHighlightColor}
                  onChange={(e) => onSubtitleOptionsChange({ ...subtitleOptions, highlightColor: e.target.value })}
                  className="h-12 w-16 cursor-pointer rounded-md border border-white/10 bg-transparent p-1"
                />
                <div>
                  <div className="text-base font-semibold text-white">{subtitleHighlightColor.toUpperCase()}</div>
                  <div className="text-sm leading-5 text-white/40">Highlight active spoken words</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <label className={`mb-3 block ${sharedSectionLabelClass}`}>Subtitle Background</label>
              <div className="grid grid-cols-2 gap-3">
                {SUBTITLE_BACKGROUND_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onSubtitleOptionsChange({
                      ...subtitleOptions,
                      background: option.value,
                      backgroundColor: subtitleOptions.backgroundColor || DEFAULT_BACKGROUND_COLOR,
                      backgroundOpacity: subtitleOptions.backgroundOpacity ?? DEFAULT_BACKGROUND_OPACITY,
                    })}
                    className={compactButtonClass((subtitleOptions.background || 'none') === option.value, 'min-w-0')}
                    title={option.desc}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`rounded-lg border border-white/10 bg-black/20 p-4 transition-opacity ${backgroundEnabled ? 'opacity-100' : 'opacity-45'}`}>
              <label className={`mb-3 block ${sharedSectionLabelClass}`}>Background Color</label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={subtitleBackgroundColor}
                  onChange={(e) => onSubtitleOptionsChange({ ...subtitleOptions, backgroundColor: e.target.value })}
                  disabled={!backgroundEnabled}
                  className="h-12 w-16 cursor-pointer rounded-md border border-white/10 bg-transparent p-1 disabled:cursor-not-allowed"
                />
                <div>
                  <div className="text-base font-semibold text-white">{subtitleBackgroundColor.toUpperCase()}</div>
                  <div className="text-sm leading-5 text-white/40">Box / pill background color</div>
                </div>
              </div>
            </div>

            <div className={`rounded-lg border border-white/10 bg-black/20 p-4 transition-opacity ${backgroundEnabled ? 'opacity-100' : 'opacity-45'}`}>
              <label className={`mb-3 block ${sharedSectionLabelClass}`}>Background Transparency</label>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-white/45">Opaque</span>
                  <span className="font-semibold text-white">{100 - subtitleBackgroundOpacity}% transparent</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={subtitleBackgroundOpacity}
                  onChange={(e) => onSubtitleOptionsChange({ ...subtitleOptions, backgroundOpacity: Number(e.target.value) })}
                  disabled={!backgroundEnabled}
                  className="w-full accent-red-500 disabled:cursor-not-allowed"
                />
                <div className="text-xs leading-5 text-white/35">Higher value = more visible subtitle background.</div>
              </div>
            </div>

            <div className={`rounded-lg border border-white/10 bg-black/20 p-4 transition-opacity ${outlineEnabled ? 'opacity-100' : 'opacity-45'}`}>
              <label className={`mb-3 block ${sharedSectionLabelClass}`}>Outline Color</label>
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={subtitleOutlineColor}
                  onChange={(e) => onSubtitleOptionsChange({ ...subtitleOptions, outlineColor: e.target.value })}
                  disabled={!outlineEnabled}
                  className="h-12 w-16 cursor-pointer rounded-md border border-white/10 bg-transparent p-1 disabled:cursor-not-allowed"
                />
                <div>
                  <div className="text-base font-semibold text-white">{subtitleOutlineColor.toUpperCase()}</div>
                  <div className="text-sm leading-5 text-white/40">Pick any outline color</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <label className={`mb-3 block ${sharedSectionLabelClass}`}>Outline Thickness</label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {OUTLINE_THICKNESS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onSubtitleOptionsChange({ ...subtitleOptions, outlineThickness: option.value })}
                    className={compactButtonClass((subtitleOptions.outlineThickness || 'medium') === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <ClipPlayer
        clip={clip}
        sourceUrl={sourceUrl}
        subtitleOptions={subtitleOptions}
        onTrimChange={onTrimChange}
        onPlaybackTimeChange={setPlayheadTime}
        externalSeekTime={externalSeekTime}
      />

      <div className="order-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <div className="min-w-0 space-y-3 rounded-lg border border-white/10 bg-black/15 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${getScoreClass(clip.virality_score)}`}>
                {clip.virality_score ?? '–'}/10 · {getScoreLabel(clip.virality_score)}
              </span>
              <span className="text-xs text-white/35">{Math.round(clip.duration)}s clip</span>
              {exportAspectRatio && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/35">
                  Auto {exportAspectRatio === 'twitter' ? '16:9' : exportAspectRatio === 'tiktok' ? '9:16' : exportAspectRatio === 'youtube_shorts' ? '1:1' : 'original'}
                </span>
              )}
            </div>
            <p className="max-w-3xl text-sm leading-6 text-white/85">{cleanClipReason(clip.ai_reason)}</p>
          </div>

          <div className="space-y-2 rounded-lg border border-white/10 bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/35">Target Platforms</span>
              <span className="text-[11px] text-white/30">{orderedSelectedPlatforms.length} selected</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {PLATFORM_OPTIONS.map((option) => {
                const active = orderedSelectedPlatforms.includes(option.value)
                return (
                  <button
                    key={option.value}
                    onClick={() => togglePlatform(option.value)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-all ${active ? 'border-red-500/30 bg-red-500/10 text-white' : 'border-white/10 bg-black/20 text-white/55 hover:border-white/20'}`}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="primary" onClick={handlePreparePost} disabled={postLoading || orderedSelectedPlatforms.length === 0}>
                {postLoading ? `Preparing ${orderedSelectedPlatforms.length > 1 ? 'Captions' : 'Caption'}...` : `Prepare ${orderedSelectedPlatforms.length > 1 ? 'Captions' : 'Caption'}`}
              </Button>

              {orderedSelectedPlatforms.length > 1 && orderedSelectedPlatforms.some((platform) => postDrafts[platform]) && (
                <Button variant="ghost" onClick={() => handleCopyPost('all')}>
                  {copiedDraftKey === 'all' ? 'Copied All' : 'Copy All'}
                </Button>
              )}
            </div>

            {orderedSelectedPlatforms.length === 0 && (
              <p className="text-xs text-white/35">Pick at least one platform to generate drafts.</p>
            )}
          </div>
        </div>

        {orderedSelectedPlatforms.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Caption drafts</div>
                <div className="text-[11px] leading-5 text-white/30">Compact launch prep. Real platform upload buttons stay placeholder-only until public launch.</div>
              </div>
              <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-200/80">
                Premium · Public launch
              </span>
            </div>

            <div className="grid gap-3 xl:grid-cols-2">
              {orderedSelectedPlatforms.map((platform) => {
                const guide = PLATFORM_PUBLISH_GUIDE[platform]
                const draft = postDrafts[platform]
                return (
                  <div key={`draft-${platform}`} className={`rounded-lg border bg-white/[0.03] p-3 space-y-3 transition-all ${selectedPublishPlatform === platform ? 'border-red-500/30 shadow-[0_0_0_1px_rgba(255,77,77,0.15)]' : 'border-white/10'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{guide.label}</div>
                        <div className="truncate text-[11px] text-white/30">{guide.exportLabel} · {draft ? 'Caption ready' : 'Caption pending'}</div>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
                        Future
                      </span>
                    </div>

                    <textarea
                      value={draft ?? ''}
                      onChange={(e) => setPostDrafts((current) => ({ ...current, [platform]: e.target.value }))}
                      placeholder="Prepare captions first so this draft is ready."
                      className="h-24 w-full resize-none rounded-lg border border-white/10 bg-black/25 p-3 text-sm leading-5 text-white/85 placeholder:text-white/25 focus:border-red-500 focus:outline-none"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => handleOpenPublishPlaceholder(platform)}>
                        Open {guide.label} Draft
                      </Button>
                      {draft && (
                        <Button variant="ghost" onClick={() => handleCopyPost(platform)}>
                          {copiedDraftKey === platform ? 'Copied' : 'Copy'}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <div className="order-3">{subtitleStylingPanel}</div>

      <div className="order-2 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        {subtitleOptions.enabled ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-white">Timeline Editor</h4>
                <p className="text-xs text-white/35">Continuous subtitle line under the video, preserved silence gaps, drag the ruler to scrub, drag the white timing handles to retime, and use playhead splits when you want tighter line control.</p>
              </div>
              <span className="text-xs text-white/35">{transcriptSegments.length} lines</span>
            </div>

            <div className="overflow-x-auto pb-2" ref={timelineViewportRef}>
              <div className="space-y-3" style={{ width: `${timelineWidth}px` }}>
                <div
                  className="relative h-16 rounded-xl border border-white/10 bg-black/25 cursor-ew-resize select-none"
                  onMouseDown={startTimelineScrub}
                >
                  <div className="absolute inset-x-4 top-8 h-1 rounded-full bg-white/10" />
                  {Array.from({ length: Math.floor(timelineDuration) + 1 }, (_, second) => {
                    const isMajor = second % 5 === 0
                    const left = second * TIMELINE_PX_PER_SECOND
                    return (
                      <div key={second} className="absolute top-0 bottom-0" style={{ left }}>
                        <div className={`absolute top-6 w-px ${isMajor ? 'h-8 bg-white/35' : 'h-4 bg-white/15'}`} />
                        {isMajor && (
                          <div className="absolute top-1 -translate-x-1/2 text-[10px] font-semibold text-white/45">
                            {formatTimestamp(second)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div
                    className="absolute top-2 bottom-2 w-2 rounded-full bg-lime-400 shadow-[0_0_16px_rgba(134,239,172,0.55)]"
                    style={{ left: `${playheadTime * TIMELINE_PX_PER_SECOND}px`, transform: 'translateX(-50%)' }}
                  />
                </div>

                <div className="relative rounded-xl border border-white/10 bg-white/[0.08] overflow-hidden" style={{ height: `${timelineTrackHeight}px` }}>
                  {Array.from({ length: Math.floor(timelineDuration) + 1 }, (_, second) => (
                    <div
                      key={`grid-${second}`}
                      className={`absolute top-0 bottom-0 ${second % 5 === 0 ? 'bg-white/12' : 'bg-white/6'}`}
                      style={{ left: `${second * TIMELINE_PX_PER_SECOND}px`, width: '1px' }}
                    />
                  ))}

                  <div
                    className="absolute left-0 right-0 h-px bg-white/12"
                    style={{ top: `${Math.round(timelineTrackHeight / 2)}px` }}
                  />

                  {gapMarkers.map((gap) => {
                    const gapWidth = Math.max(0, (gap.end - gap.start) * TIMELINE_PX_PER_SECOND)
                    return (
                      <div
                        key={`${gap.start}-${gap.end}`}
                        className="absolute rounded-md border border-dashed border-white/10 bg-black/12"
                        style={{
                          left: `${gap.start * TIMELINE_PX_PER_SECOND}px`,
                          top: `${TIMELINE_TRACK_PADDING_Y}px`,
                          width: `${gapWidth}px`,
                          height: `${timelineTrackHeight - (TIMELINE_TRACK_PADDING_Y * 2)}px`,
                        }}
                      >
                        {gapWidth > 92 && (
                          <div className="flex h-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/20">
                            {gap.duration.toFixed(1)}s gap
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {stackedTimelineSegments.map(({ segment, index, isSelected, bounds, left, width, lane }) => {
                    const zIndex = isSelected ? (timelineLaneCount + 10) : (timelineLaneCount - lane)
                    return (
                      <button
                        key={`${segment.start}-${segment.end}-${index}`}
                        onClick={() => {
                          setSelectedSegmentIndex(index)
                          queueSeek(segment.start)
                          scrollTimelineTo(segment.start)
                        }}
                        title={segment.text}
                        aria-label={`${formatTimestamp(bounds.start, true)} ${segment.text}`}
                        className={`absolute overflow-hidden rounded-lg px-2 text-left transition-all ${isSelected ? 'bg-red-500/10 shadow-[0_0_24px_rgba(255,77,77,0.12)]' : 'bg-transparent hover:bg-white/[0.03]'}`}
                        style={{
                          left: `${left}px`,
                          top: `${TIMELINE_TRACK_PADDING_Y + (lane * (TIMELINE_SEGMENT_HEIGHT + TIMELINE_SEGMENT_ROW_GAP))}px`,
                          width: `${width}px`,
                          height: `${TIMELINE_SEGMENT_HEIGHT}px`,
                          zIndex,
                        }}
                      >
                        <div className={`pointer-events-none pr-4 text-[10px] font-semibold uppercase tracking-[0.16em] ${isSelected ? 'text-red-300/80' : 'text-white/28'}`}>
                          {formatTimestamp(bounds.start, true)}
                        </div>
                        <div className={`pointer-events-none mt-1 truncate text-sm leading-5 ${isSelected ? 'text-white' : 'text-white/82'}`}>
                          {segment.text}
                        </div>
                        <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] ${isSelected ? 'bg-red-400/80' : 'bg-white/10'}`} />

                        {isSelected && (
                          <>
                            <div
                              className="absolute inset-y-2 left-0.5 z-[1] w-2 cursor-ew-resize rounded-full bg-white/80 hover:bg-white"
                              onMouseDown={(event) => startSegmentResize(event, 'start')}
                              title="Drag line start"
                            />
                            <div
                              className="absolute inset-y-2 right-0.5 z-[1] w-2 cursor-ew-resize rounded-full bg-white/80 hover:bg-white"
                              onMouseDown={(event) => startSegmentResize(event, 'end')}
                              title="Drag line end"
                            />
                          </>
                        )}
                      </button>
                    )
                  })}

                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-lime-400/90 shadow-[0_0_14px_rgba(134,239,172,0.6)] pointer-events-none"
                    style={{ left: `${playheadTime * TIMELINE_PX_PER_SECOND}px` }}
                  />
                </div>
              </div>
            </div>

            {selectedSegment ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Edit line · {formatTimestamp((segmentBoundsDraft ?? selectedSegment).start, true)} to {formatTimestamp((segmentBoundsDraft ?? selectedSegment).end, true)}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedSegmentIndex(null)
                      setSegmentBoundsDraft(null)
                    }}
                    className="text-xs text-white/35 hover:text-white"
                  >
                    Clear selection
                  </button>
                </div>
                <input
                  value={segmentDraft}
                  onChange={(e) => setSegmentDraft(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleApplyTranscriptEdit()
                    }
                  }}
                  className="h-12 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white/90 focus:border-red-500 focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-white/35">
                    This stays a continuous line editor. If a line needs more room, edit the text, retime it with the white handles, or split it at the current playhead instead of fighting auto-bubbles.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canSplitSelectedSegment && (
                      <Button variant="ghost" onClick={handleSplitSegmentAtPlayhead}>Split at Playhead</Button>
                    )}
                    {canMergeNextSegment && (
                      <Button variant="ghost" onClick={handleMergeNextSegment}>Merge Next</Button>
                    )}
                    <Button variant="ghost" onClick={() => setSelectedSegmentIndex(null)}>Cancel</Button>
                    <Button variant="primary" onClick={handleApplyTranscriptEdit}>Apply Line</Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/35">
                  <span>{selectedSegment.wordCount} words</span>
                  <span>•</span>
                  <span>{selectedSegment.endsWithManualBreak ? 'Manual break after this line' : 'Auto flow into the next line'}</span>
                </div>
              </div>
            ) : transcriptSegments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-4 text-sm text-white/40">
                No subtitle timeline available for this clip yet.
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-4 text-sm text-white/45">
            Subtitles are off, so the transcription editor is hidden for this clip.
          </div>
        )}
      </div>

      <div className="order-5">{children}</div>
    </div>
  )
}
