'use client'

import Image from 'next/image'
import { CSSProperties, MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { getApiUrl } from '@/lib/api-url'
import { getClipStableId } from '@/lib/clip-id'
import { EXAMPLE_CLIPS } from '@/lib/example-clips'
import { emojiCensorWord, groupSubtitleWords } from '@/lib/subtitle-core'
import {
  ActiveWordStyle,
  Clip,
  Job,
  SubtitleAnimationPreset,
  SubtitleBackground,
  SubtitleCase,
  SubtitleFont,
  SubtitleMode,
  SubtitleOptions,
  SubtitleOutlineThickness,
  SubtitlePreset,
  SubtitleSafeZone,
  SubtitleSize,
} from '@/types'

type ExportFormat = 'twitter' | 'tiktok' | 'youtube_shorts' | 'custom'
type PanelKey = 'subtitle' | 'layout' | 'export'

interface StudioClip {
  id: string
  title: string
  hook: string
  score: number
  duration: number
  start: string
  startTime: number
  endTime: number
  caption: string
  sourceUrl: string
  jobTitle: string
  thumbnailTime: number
  thumbnailUrl?: string
  transcript: { text: string; start: number; end: number }[]
}

// Real example clips (cut from a completed Slicer job) shown when the account
// has no processed jobs yet. Data + media live in lib/example-clips.ts and public/examples/.
const STUDIO_CLIPS: StudioClip[] = EXAMPLE_CLIPS

const SUBTITLE_PRESETS: { value: SubtitlePreset; label: string; desc: string; options: Partial<SubtitleOptions> }[] = [
  { value: 'auto', label: 'Auto', desc: 'Slicer picks the safest creator-ready default', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'impact', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'clean_tiktok', label: 'Clean TikTok', desc: 'Native-looking white text with strong outline', options: { mode: 'phrase', safeZone: 'bottom_safe', font: 'montserrat', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'medium', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'gaming_pop', label: 'Gaming Pop', desc: 'Big punchy action captions', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'impact', size: 'large', color: '#ffffff', highlightColor: '#ff3b30', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'color', textCase: 'upper' } },
  { value: 'hormozi_highlight', label: 'Hormozi Highlight', desc: 'Phrase captions with active keyword emphasis', options: { mode: 'active_word', safeZone: 'center_safe', font: 'arial_black', size: 'medium', color: '#ffffff', highlightColor: '#ffeb3b', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'color', textCase: 'original' } },
  { value: 'mcv_branded', label: 'MCV Branded', desc: 'Mars Cats red highlight and watermark-ready', options: { mode: 'active_word', safeZone: 'bottom_safe', font: 'sora', size: 'medium', color: '#ffffff', highlightColor: '#ff4d4d', outlineThickness: 'thick', outlineColor: '#050505', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'color', textCase: 'original', watermarkEnabled: true } },
  { value: 'meme_bold', label: 'Meme Bold', desc: 'Loud all-caps punchline style', options: { mode: 'word_pop', safeZone: 'center_safe', font: 'impact', size: 'large', color: '#ffffff', highlightColor: '#00e5ff', outlineThickness: 'thick', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'scale', textCase: 'upper' } },
  { value: 'minimal_white', label: 'Minimal White', desc: 'Small clean captions for dialogue-heavy clips', options: { mode: 'phrase', safeZone: 'upper_safe', font: 'montserrat', size: 'small', color: '#ffffff', highlightColor: '#ffffff', outlineThickness: 'thin', outlineColor: '#000000', background: 'none', backgroundColor: '#000000', backgroundOpacity: 45, shadow: true, animationPreset: 'none', activeWordStyle: 'color', textCase: 'original' } },
]

const SUBTITLE_MODE_OPTIONS: { value: SubtitleMode; label: string; desc: string }[] = [
  { value: 'phrase', label: 'Phrase', desc: 'Classic chunked captions' },
  { value: 'active_word', label: 'Active Word', desc: 'Full phrase with highlight' },
  { value: 'word_pop', label: 'Word Pop', desc: 'One word at a time' },
  { value: 'karaoke', label: 'Karaoke', desc: 'Sweep timing highlight' },
]

const SAFE_ZONE_OPTIONS: { value: SubtitleSafeZone; label: string }[] = [
  { value: 'bottom_safe', label: 'Bottom Safe' },
  { value: 'center_safe', label: 'Center' },
  { value: 'upper_safe', label: 'Upper Safe' },
  { value: 'auto', label: 'Auto' },
  { value: 'custom', label: 'Custom' },
]

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
  { value: 'comic_sans', label: 'Comic Sans' },
  { value: 'cooper_black', label: 'Cooper Black' },
  { value: 'arial_rounded', label: 'Arial Rounded' },
  { value: 'lucida_handwriting', label: 'Lucida Handwriting' },
  { value: 'brush_script', label: 'Brush Script' },
  { value: 'papyrus', label: 'Papyrus' },
]

const SIZE_OPTIONS: { value: SubtitleSize; label: string }[] = [{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]
const BACKGROUND_OPTIONS: { value: SubtitleBackground; label: string }[] = [{ value: 'none', label: 'Off' }, { value: 'solid', label: 'Box' }, { value: 'rounded_box', label: 'Rounded' }, { value: 'active_word_pill', label: 'Word Pill' }]
const OUTLINE_OPTIONS: { value: SubtitleOutlineThickness; label: string }[] = [{ value: 'none', label: 'Off' }, { value: 'thin', label: 'Thin' }, { value: 'medium', label: 'Med' }, { value: 'thick', label: 'Thick' }]
const ANIMATION_OPTIONS: { value: SubtitleAnimationPreset; label: string }[] = [{ value: 'none', label: 'None' }, { value: 'pop', label: 'Pop' }, { value: 'fade', label: 'Fade' }]
const ACTIVE_WORD_OPTIONS: { value: ActiveWordStyle; label: string }[] = [{ value: 'color', label: 'Color' }, { value: 'scale', label: 'Scale' }, { value: 'pill', label: 'Pill' }, { value: 'underline', label: 'Underline' }]
const CASE_OPTIONS: { value: SubtitleCase; label: string }[] = [{ value: 'original', label: 'Original' }, { value: 'upper', label: 'UPPER' }, { value: 'title', label: 'Title' }]
const MIN_TRIM_DURATION = 1
const CUSTOM_SAFE_ZONE_OFFSET_MAX = 88

const SUBTITLE_FONT_FAMILIES: Record<SubtitleFont, string> = {
  impact: 'Impact, Arial Black, sans-serif',
  bebas: '"Bebas Neue", Impact, sans-serif',
  montserrat: '"Montserrat", Arial, sans-serif',
  sora: '"Montserrat", Arial, sans-serif',
  arial_black: '"Arial Black", Arial, sans-serif',
  trebuchet: '"Trebuchet MS", sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, serif',
  times_new_roman: '"Times New Roman", serif',
  comic_sans: '"Comic Sans MS", "Comic Sans", cursive',
  cooper_black: '"Cooper Black", Impact, serif',
  arial_rounded: '"Arial Rounded MT Bold", Arial, sans-serif',
  lucida_handwriting: '"Lucida Handwriting", "Brush Script MT", cursive',
  brush_script: '"Brush Script MT", "Lucida Handwriting", cursive',
  papyrus: 'Papyrus, fantasy',
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  twitter: '16:9',
  tiktok: '9:16',
  youtube_shorts: '1:1',
  custom: 'Original',
}

const DEFAULT_SUBTITLES: SubtitleOptions = {
  enabled: true,
  size: 'medium',
  color: '#ffffff',
  position: 'bottom',
  safeZone: 'bottom_safe',
  style: 'outline',
  background: 'none',
  backgroundColor: '#000000',
  backgroundOpacity: 45,
  font: 'sora',
  mode: 'active_word',
  preset: 'mcv_branded',
  animationPreset: 'none',
  highlightColor: '#ff4d4d',
  activeWordStyle: 'color',
  autoKeywords: true,
  outlineThickness: 'thick',
  outlineColor: '#050505',
  shadow: true,
  textCase: 'original',
  watermarkEnabled: true,
  profanityFilter: false,
}

function buttonClass(active: boolean) {
  return `rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-all ${
    active
      ? 'border-red-500/35 bg-red-500/12 text-white shadow-[0_0_24px_rgba(255,77,77,0.10)]'
      : 'border-white/10 bg-black/20 text-white/55 hover:border-white/20 hover:text-white'
  }`
}

function selectClass() {
  return 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white focus:border-red-500 focus:outline-none'
}

function textInputClass() {
  return 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none'
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const tenths = Math.floor((seconds % 1) * 10)
  return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`
}

function clampTime(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgba(hex = '#000000', opacityPercent = 45) {
  const normalized = hex.replace('#', '')
  const fullHex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6)
  const red = parseInt(fullHex.slice(0, 2), 16)
  const green = parseInt(fullHex.slice(2, 4), 16)
  const blue = parseInt(fullHex.slice(4, 6), 16)
  const alpha = clampTime(opacityPercent, 0, 100) / 100
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function applyPreset(current: SubtitleOptions, preset: SubtitlePreset): SubtitleOptions {
  const selected = SUBTITLE_PRESETS.find((entry) => entry.value === preset) || SUBTITLE_PRESETS[0]
  return { ...current, ...selected.options, preset, enabled: current.enabled }
}

function labelFor<T extends string>(items: { value: T; label: string }[], value?: T) {
  return items.find((item) => item.value === value)?.label || value || 'Auto'
}

function slugifyFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'slicer'
}

function censorSubtitleText(text: string, enabled?: boolean) {
  if (!enabled) return text
  let hitIndex = 0

  return text.split(/(\s+)/).map((part) => {
    if (!part || /^\s+$/.test(part)) return part
    const censored = emojiCensorWord(part, hitIndex)
    if (censored !== part) hitIndex += 1
    return censored
  }).join('')
}

function clipTitle(clip: Clip, index: number) {
  const reason = clip.ai_reason?.trim()
  if (reason) return reason.length > 42 ? `${reason.slice(0, 39)}...` : reason
  return `Clip ${index + 1}`
}

function clipTranscript(clip: Clip) {
  const groups = groupSubtitleWords(clip.subtitles ?? [])
  if (groups.length > 0) {
    return groups.map((words) => ({
      text: words.map((word) => word.text).join(' '),
      start: Math.max(0, words[0]?.start ?? 0),
      end: Math.max(words[0]?.start ?? 0.1, words[words.length - 1]?.end ?? 0.1),
    }))
  }

  const fallbackText = clip.ai_reason?.trim() || 'No subtitle transcript found for this clip yet.'
  return [{ text: fallbackText, start: 0, end: Math.max(1, Math.min(clip.duration || 4, 4)) }]
}

function jobToStudioClips(job: Job): StudioClip[] {
  return (job.clips ?? []).map((clip, index) => {
    const clipId = getClipStableId(clip)
    const transcript = clipTranscript(clip)
    const proofFrame = clip.proof_frames?.find((frame) => frame.label === 'best') || clip.proof_frames?.[0]
    const duration = Number.isFinite(clip.duration) && clip.duration > 0
      ? clip.duration
      : Math.max(1, clip.end_time - clip.start_time)

    return {
      id: clipId || `${job.id}-${index}`,
      title: clipTitle(clip, index),
      hook: clip.ai_reason || 'Real Slicer clip',
      score: Number((clip.virality_score ?? 0).toFixed(1)),
      duration,
      start: formatTime(clip.start_time).replace('.0', ''),
      caption: transcript[0]?.text || clip.ai_reason || `Clip ${index + 1}`,
      sourceUrl: job.source_url,
      jobTitle: job.title,
      startTime: clip.start_time,
      endTime: clip.end_time,
      thumbnailTime: Math.max(0, Number(proofFrame?.timestamp ?? clip.start_time + (duration / 2))),
      transcript,
    }
  })
}

function transcriptToSubtitleWords(transcript: StudioClip['transcript']) {
  return transcript.flatMap((line) => {
    const words = line.text.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []

    const duration = Math.max(0.1, line.end - line.start)
    const wordDuration = duration / words.length

    return words.map((word, index) => ({
      text: word,
      start: Number((line.start + wordDuration * index).toFixed(2)),
      end: Number((line.start + wordDuration * (index + 1)).toFixed(2)),
    }))
  })
}

interface JobStudioTabProps {
  selectedJobId?: string
  selectedClipId?: string
  initialJob?: Job
  onBackToStreams?: () => void
}

export default function JobStudioTab({ selectedJobId, selectedClipId, initialJob, onBackToStreams }: JobStudioTabProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trimTrackRef = useRef<HTMLDivElement>(null)
  const previewHoverTimerRef = useRef<number | null>(null)
  const appliedSelectedClipIdRef = useRef<string | undefined>()
  const [jobs, setJobs] = useState<Job[]>(initialJob ? [initialJob] : [])
  const [isLoadingJobs, setIsLoadingJobs] = useState(true)
  const [openPanel, setOpenPanel] = useState<PanelKey>('subtitle')
  const [activeClipIndex, setActiveClipIndex] = useState(0)
  const [selectedLineIndex, setSelectedLineIndex] = useState(1)
  const [playheadTime, setPlayheadTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(1)
  const [draggingTrim, setDraggingTrim] = useState<'start' | 'end' | null>(null)
  const [clipThumbnails, setClipThumbnails] = useState<Record<string, string>>({})
  const [lineEdits, setLineEdits] = useState<Record<string, Partial<StudioClip['transcript'][number]>>>({})
  const [subtitleOptions, setSubtitleOptions] = useState<SubtitleOptions>(DEFAULT_SUBTITLES)
  const [format, setFormat] = useState<ExportFormat>('custom')
  const [safeZoneOffset, setSafeZoneOffset] = useState(18)
  const [sourceAspectRatio, setSourceAspectRatio] = useState<number | null>(null)
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadJobs = async () => {
      try {
        const res = await fetch('/api/jobs', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          const fetchedJobs = (data.jobs ?? []) as Job[]
          if (initialJob && !fetchedJobs.some((job) => job.id === initialJob.id)) {
            setJobs([initialJob, ...fetchedJobs])
          } else {
            setJobs(fetchedJobs)
          }
        }
      } finally {
        if (!cancelled) setIsLoadingJobs(false)
      }
    }

    loadJobs()
    const interval = window.setInterval(loadJobs, 8000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [initialJob])

  const activeJob = useMemo(() => {
    if (selectedJobId) {
      return jobs.find((job) => job.id === selectedJobId) ?? initialJob ?? null
    }

    return jobs.find((job) => (job.clips?.length ?? 0) > 0) ?? null
  }, [initialJob, jobs, selectedJobId])
  const studioClips = useMemo(() => activeJob ? jobToStudioClips(activeJob) : STUDIO_CLIPS, [activeJob])
  const activeClip = studioClips[activeClipIndex] ?? studioClips[0]

  useEffect(() => {
    let cancelled = false

    const loadThumbnails = async () => {
      const nextThumbnails: Record<string, string> = {}

      // Example clips ship pre-rendered thumbnails; no API round-trip needed
      studioClips.forEach((clip) => {
        if (clip.thumbnailUrl) nextThumbnails[clip.id] = clip.thumbnailUrl
      })

      const apiClips = studioClips.filter((clip) => !clip.thumbnailUrl && clip.sourceUrl)

      try {
        if (apiClips.length > 0) {
          const apiBase = (await getApiUrl()).replace(/\/$/, '')
          apiClips.forEach((clip) => {
            const url = new URL(`${apiBase}/thumbnail`)
            url.searchParams.set('sourceUrl', clip.sourceUrl)
            url.searchParams.set('timestamp', clip.thumbnailTime.toFixed(2))
            url.searchParams.set('clipId', clip.id)
            nextThumbnails[clip.id] = url.toString()
          })
        }
      } catch {
        // static thumbnails below still apply
      }

      if (!cancelled) setClipThumbnails(nextThumbnails)
    }

    loadThumbnails()
    return () => {
      cancelled = true
    }
  }, [studioClips])

  useEffect(() => {
    setActiveClipIndex((current) => Math.min(current, Math.max(0, studioClips.length - 1)))
    setSelectedLineIndex(0)
  }, [studioClips.length])

  useEffect(() => {
    if (!selectedClipId) return
    if (appliedSelectedClipIdRef.current === selectedClipId) return
    const selectedIndex = studioClips.findIndex((clip) => clip.id === selectedClipId)
    if (selectedIndex < 0) return
    appliedSelectedClipIdRef.current = selectedClipId
    setActiveClipIndex(selectedIndex)
    setSelectedLineIndex(0)
    setPlayheadTime(0)
    setTrimStart(0)
    setTrimEnd(studioClips[selectedIndex]?.duration || 1)
    setIsPlaying(false)
  }, [selectedClipId, studioClips])

  const editedTranscript = useMemo(() => activeClip.transcript.map((line, index) => ({
    ...line,
    ...(lineEdits[`${activeClip.id}-${index}`] || {}),
  })), [activeClip, lineEdits])
  const selectedLine = editedTranscript[selectedLineIndex] || editedTranscript[0]
  const presetDetails = SUBTITLE_PRESETS.find((entry) => entry.value === subtitleOptions.preset) || SUBTITLE_PRESETS[0]
  const activeClipDuration = Math.max(activeClip.duration, activeClip.endTime - activeClip.startTime, 1)
  const timelineDuration = activeClipDuration
  const trimDuration = Math.max(MIN_TRIM_DURATION, trimEnd - trimStart)
  const progressPercent = Math.min(100, Math.max(0, (playheadTime / timelineDuration) * 100))
  const trimStartPercent = (trimStart / timelineDuration) * 100
  const trimEndPercent = (trimEnd / timelineDuration) * 100
  const selectedLineKey = `${activeClip.id}-${selectedLineIndex}`
  const activeSubtitleLine = useMemo(() => (
    editedTranscript.find((line) => playheadTime >= line.start && playheadTime < line.end) ?? null
  ), [editedTranscript, playheadTime])
  const gapMarkers = useMemo(() => editedTranscript.slice(0, -1).map((line, index) => {
    const next = editedTranscript[index + 1]
    const duration = Math.max(0, next.start - line.end)
    return { start: line.end, end: next.start, duration }
  }).filter((gap) => gap.duration >= 0.6), [editedTranscript])

  const captionWords = useMemo(() => {
    const source = censorSubtitleText(activeSubtitleLine?.text || '', subtitleOptions.profanityFilter)
    const text = subtitleOptions.textCase === 'upper'
      ? source.toUpperCase()
      : subtitleOptions.textCase === 'title'
        ? source.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        : source
    const words = text.split(' ').filter(Boolean)
    const lineDuration = activeSubtitleLine ? Math.max(0.1, activeSubtitleLine.end - activeSubtitleLine.start) : 0.1
    const lineProgress = activeSubtitleLine ? clampTime((playheadTime - activeSubtitleLine.start) / lineDuration, 0, 0.999) : 0
    const activeWordIndex = Math.min(words.length - 1, Math.floor(lineProgress * Math.max(1, words.length)))
    return words.map((word, index) => ({ word, active: index === activeWordIndex }))
  }, [activeSubtitleLine, playheadTime, subtitleOptions.profanityFilter, subtitleOptions.textCase])

  const previewAspectRatio = format === 'tiktok'
    ? 9 / 16
    : format === 'youtube_shorts'
      ? 1
      : format === 'twitter'
        ? 16 / 9
        : sourceAspectRatio || 16 / 9

  const previewMaxWidth = format === 'tiktok'
    ? '450px'
    : format === 'youtube_shorts'
      ? '720px'
      : format === 'custom' && previewAspectRatio < 1
        ? '450px'
        : '1160px'

  const previewShape = 'mx-auto max-h-full max-w-full'

  const previewStyle: CSSProperties = {
    aspectRatio: previewAspectRatio,
    width: `min(100%, calc(74vh * ${previewAspectRatio}), ${previewMaxWidth})`,
    height: 'auto',
  }

  const expandedPreviewStyle: CSSProperties = isPreviewExpanded
    ? {
      aspectRatio: previewAspectRatio,
      width: `min(94vw, calc(88vh * ${previewAspectRatio}))`,
      maxWidth: '94vw',
      maxHeight: '88vh',
    }
    : {}

  const videoFitClass = format === 'custom' ? 'object-contain' : 'object-cover'

  const captionPositionClass = subtitleOptions.safeZone === 'upper_safe'
    ? 'top-[12%]'
    : subtitleOptions.safeZone === 'center_safe'
      ? 'top-1/2 -translate-y-1/2'
      : subtitleOptions.safeZone === 'custom'
        ? ''
        : 'bottom-[18%]'

  const outline = subtitleOptions.outlineThickness || 'medium'
  const outlineColor = subtitleOptions.outlineColor || '#000000'
  const outlineShadow = outline === 'none'
    ? (subtitleOptions.shadow ? '0 5px 16px rgba(0,0,0,0.78)' : 'none')
    : outline === 'thin'
      ? `1px 1px 0 ${outlineColor}, -1px 1px 0 ${outlineColor}, 0 4px 12px rgba(0,0,0,0.65)`
      : outline === 'medium'
        ? `2px 2px 0 ${outlineColor}, -2px 2px 0 ${outlineColor}, 2px -2px 0 ${outlineColor}, -2px -2px 0 ${outlineColor}, 0 4px 12px rgba(0,0,0,0.70)`
        : `3px 3px 0 ${outlineColor}, -3px 3px 0 ${outlineColor}, 3px -3px 0 ${outlineColor}, -3px -3px 0 ${outlineColor}, 0 5px 16px rgba(0,0,0,0.75)`

  const assFontSize = subtitleOptions.mode === 'word_pop'
    ? subtitleOptions.size === 'small'
      ? 20
      : subtitleOptions.size === 'large'
        ? 36
        : 30
    : subtitleOptions.size === 'small'
      ? 16
      : subtitleOptions.size === 'large'
        ? 24
        : 18
  const previewFontSize = `${((assFontSize / 720) * 100).toFixed(3)}cqh`
  const previewWordGap = `${((10 / 720) * 100).toFixed(3)}cqh`

  const goToClip = (offset: number) => {
    setActiveClipIndex((current) => {
      const next = (current + offset + studioClips.length) % studioClips.length
      setSelectedLineIndex(0)
      setPlayheadTime(0)
      setTrimStart(0)
      setTrimEnd(studioClips[next]?.duration || 1)
      return next
    })
  }

  const selectClip = (index: number) => {
    const clip = studioClips[index]
    if (!clip) return
    videoRef.current?.pause()
    setActiveClipIndex(index)
    setSelectedLineIndex(0)
    setPlayheadTime(0)
    setTrimStart(0)
    setTrimEnd(clip.duration || 1)
    setIsPlaying(false)
  }

  const seekPreview = (nextTime: number, shouldPlay = isPlaying) => {
    const clampedTime = clampTime(nextTime, trimStart, trimEnd)
    const video = videoRef.current
    setPlayheadTime(clampedTime)
    if (video) {
      video.currentTime = activeClip.startTime + clampedTime
      if (shouldPlay) {
        void video.play()
      }
    }
  }

  const togglePreviewPlayback = () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
      return
    }

    if (playheadTime >= trimEnd - 0.05) {
      seekPreview(trimStart, false)
    } else if (video.currentTime < activeClip.startTime || video.currentTime >= activeClip.endTime) {
      video.currentTime = activeClip.startTime + playheadTime
    }

    void video.play()
  }

  const handlePreviewTimeUpdate = () => {
    const video = videoRef.current
    if (!video) return

    if (video.currentTime >= activeClip.startTime + trimEnd) {
      video.pause()
      video.currentTime = activeClip.startTime + trimStart
      setPlayheadTime(trimStart)
      return
    }

    setPlayheadTime(clampTime(video.currentTime - activeClip.startTime, trimStart, trimEnd))
  }

  const handleTimelineScrub = (event: MouseEvent<HTMLDivElement>) => {
    const rect = trimTrackRef.current?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect()
    const ratio = clampTime((event.clientX - rect.left) / rect.width, 0, 1)
    seekPreview(ratio * timelineDuration)
  }

  const handleTrimDrag = (event: MouseEvent<HTMLDivElement>, handle: 'start' | 'end') => {
    event.preventDefault()
    event.stopPropagation()
    setDraggingTrim(handle)

    const moveToClientX = (clientX: number) => {
      const rect = trimTrackRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      const ratio = clampTime((clientX - rect.left) / rect.width, 0, 1)
      const nextTime = ratio * timelineDuration

      if (handle === 'start') {
        const nextStart = clampTime(nextTime, 0, Math.max(0, trimEnd - MIN_TRIM_DURATION))
        setTrimStart(nextStart)
        if (playheadTime < nextStart) seekPreview(nextStart, isPlaying)
      } else {
        const nextEnd = clampTime(nextTime, Math.min(timelineDuration, trimStart + MIN_TRIM_DURATION), timelineDuration)
        setTrimEnd(nextEnd)
        if (playheadTime > nextEnd) seekPreview(nextEnd, isPlaying)
      }
    }

    const onMove = (moveEvent: globalThis.MouseEvent) => moveToClientX(moveEvent.clientX)
    const onUp = (upEvent: globalThis.MouseEvent) => {
      moveToClientX(upEvent.clientX)
      setDraggingTrim(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const clearPreviewHoverTimer = () => {
    if (!previewHoverTimerRef.current) return
    window.clearTimeout(previewHoverTimerRef.current)
    previewHoverTimerRef.current = null
  }

  const handlePreviewMouseEnter = () => {
    clearPreviewHoverTimer()
    previewHoverTimerRef.current = window.setTimeout(() => {
      previewHoverTimerRef.current = null
      setIsPreviewExpanded(true)
    }, 3000)
  }

  const handlePreviewMouseLeave = () => {
    clearPreviewHoverTimer()
    setIsPreviewExpanded(false)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    clearPreviewHoverTimer()
    setIsPreviewExpanded(false)
    video.pause()
    video.currentTime = activeClip.startTime
    setIsPlaying(false)
    setPlayheadTime(0)
    setTrimStart(0)
    setTrimEnd(activeClipDuration)
    setSourceAspectRatio(null)
  }, [activeClip.id, activeClip.startTime, activeClipDuration])

  useEffect(() => {
    return () => {
      clearPreviewHoverTimer()
    }
  }, [])

  const updateSubtitleOptions = (next: Partial<SubtitleOptions>) => {
    setSubtitleOptions((current) => ({ ...current, ...next }))
  }

  const updateSelectedLine = (next: Partial<StudioClip['transcript'][number]>) => {
    setLineEdits((current) => ({
      ...current,
      [selectedLineKey]: {
        ...(current[selectedLineKey] || {}),
        ...next,
      },
    }))
  }

  const exportActiveClip = async () => {
    if (!activeJob || !activeClip.sourceUrl || isExporting) return

    setIsExporting(true)
    setExportStatus('Exporting...')

    try {
      const apiBase = (await getApiUrl()).replace(/\/$/, '')
      const startTime = activeClip.startTime + trimStart
      const endTime = activeClip.startTime + trimEnd
      const subtitles = transcriptToSubtitleWords(editedTranscript)

      const res = await fetch(`${apiBase}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: activeClip.sourceUrl,
          startTime,
          endTime,
          title: `${slugifyFilePart(activeJob.title || activeClip.jobTitle)}-clip-${Math.round(startTime)}s`,
          subtitles,
          subtitleOptions: { ...subtitleOptions, safeZoneOffset },
          aspectRatio: format,
          originalStartTime: activeClip.startTime,
        }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'Export failed' }))
        setExportStatus(payload.error || 'Export failed')
        return
      }

      setExportStatus('Downloading...')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${slugifyFilePart(activeJob.title || activeClip.jobTitle)}-clip-${Math.round(startTime)}s.mp4`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      setExportStatus('Done')
    } catch {
      setExportStatus('Export server unavailable')
    } finally {
      window.setTimeout(() => {
        setIsExporting(false)
        setExportStatus('')
      }, 2000)
    }
  }

  return (
    <div className="py-1">
      <div className="grid gap-3 xl:h-[calc(100vh-94px)] xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
        <section className="flex min-w-0 flex-col gap-3 xl:min-h-0">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2 xl:min-h-0 xl:flex-[1_1_auto]">
            <div className="flex h-full flex-col overflow-visible rounded-xl border border-white/10 bg-black/35">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">{activeJob ? 'Selected Job Studio' : isLoadingJobs ? 'Loading Job Clips' : 'Sample Preview'}</p>
                    {onBackToStreams && (
                      <button
                        type="button"
                        onClick={onBackToStreams}
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/45 transition-all hover:border-white/20 hover:text-white"
                      >
                        Streams
                      </button>
                    )}
                  </div>
                  <h1 className="max-w-[340px] truncate text-base font-black text-white sm:max-w-[520px]">{activeClip.jobTitle} - Clip {activeClipIndex + 1}: {activeClip.title}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/45">{FORMAT_LABELS[format]}</span>
                  <span className="hidden rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/45 sm:inline-flex">{activeClip.score}/10</span>
                  <span className="hidden rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/45 sm:inline-flex">{activeClip.start} - {activeClip.duration}s</span>
                  <button
                    type="button"
                    onClick={exportActiveClip}
                    disabled={isExporting || !activeClip.sourceUrl}
                    className="rounded-lg px-3 py-2 text-xs font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-55"
                    style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}
                  >
                    {isExporting ? exportStatus || 'Exporting...' : 'Export'}
                  </button>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center overflow-visible bg-black p-2 xl:min-h-0 min-h-[620px]">
                <div
                  className={`${previewShape} group/preview ${isPreviewExpanded ? 'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-none border-0 shadow-none' : 'relative z-10 rounded-xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.55)] hover:border-red-300/35 hover:shadow-[0_30px_110px_rgba(0,0,0,0.78),0_0_0_1px_rgba(255,77,77,0.18)]'} overflow-hidden bg-black transition-[width,height,max-width,border-color,box-shadow] duration-200 ease-out`}
                  style={{ ...previewStyle, ...expandedPreviewStyle, containerType: 'size' }}
                  onMouseEnter={handlePreviewMouseEnter}
                  onMouseLeave={handlePreviewMouseLeave}
                >
                  {!isPreviewExpanded && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 translate-y-1 rounded-md border border-white/10 bg-black/80 px-3 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg backdrop-blur-sm transition-all duration-150 group-hover/preview:translate-y-0 group-hover/preview:opacity-100">
                      Hover to Enlarge
                    </div>
                  )}
                  <video
                    key={activeClip.id}
                    ref={videoRef}
                    src={activeClip.sourceUrl || '/slicer-cat.mp4'}
                    className={`h-full w-full ${videoFitClass}`}
                    preload="metadata"
                    playsInline
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget
                      if (video.videoWidth > 0 && video.videoHeight > 0) {
                        setSourceAspectRatio(video.videoWidth / video.videoHeight)
                      }
                      seekPreview(playheadTime, false)
                    }}
                    onTimeUpdate={handlePreviewTimeUpdate}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),transparent_30%,rgba(0,0,0,0.25))]" />
                  <button
                    type="button"
                    onClick={togglePreviewPlayback}
                    aria-label={isPlaying ? 'Pause clip preview' : 'Play clip preview'}
                    className={`absolute inset-0 z-20 flex items-center justify-center transition-colors ${isPlaying ? 'bg-transparent hover:bg-black/10' : 'bg-black/20 hover:bg-black/30'}`}
                  >
                    <span
                      className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white transition-opacity ${isPreviewExpanded ? 'border border-white/15 bg-black/60 shadow-[0_10px_28px_rgba(0,0,0,0.35)]' : 'border border-white/25 bg-white/15 shadow-[0_14px_40px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md'} ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
                    >
                      <span aria-hidden="true" className="drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">{isPlaying ? '❚❚' : '▶'}</span>
                    </span>
                  </button>
                  {subtitleOptions.watermarkEnabled && (
                    <Image src="/slicer-watermark-white.png" alt="Slicer watermark" width={180} height={180} className="absolute bottom-4 right-4 h-14 w-14 object-contain opacity-55 drop-shadow-[0_0_14px_rgba(255,77,77,0.22)]" />
                  )}
                  {subtitleOptions.enabled && activeSubtitleLine && captionWords.length > 0 && (
                    <div
                      className={`absolute left-0 right-0 flex justify-center ${captionPositionClass}`}
                      style={{
                        paddingLeft: `${((16 / 720) * 100).toFixed(3)}cqh`,
                        paddingRight: `${((16 / 720) * 100).toFixed(3)}cqh`,
                        bottom: subtitleOptions.safeZone === 'custom' ? `${safeZoneOffset}cqh` : undefined,
                        transform: subtitleOptions.safeZone === 'custom' ? 'translateY(50%)' : undefined,
                      }}
                    >
                      <div
                        className={`max-w-[90%] text-center ${subtitleOptions.animationPreset === 'pop' ? 'scale-105' : ''} ${subtitleOptions.animationPreset === 'fade' ? 'opacity-85' : ''}`}
                        style={{
                          fontFamily: SUBTITLE_FONT_FAMILIES[subtitleOptions.font || 'impact'],
                          fontSize: previewFontSize,
                          fontWeight: subtitleOptions.mode === 'active_word' ? 800 : 700,
                          lineHeight: subtitleOptions.mode === 'phrase' ? 1.5 : 1.1,
                          letterSpacing: subtitleOptions.mode === 'phrase' ? '0.03em' : '0.025em',
                          color: subtitleOptions.color || '#ffffff',
                          textShadow: outlineShadow,
                          background: subtitleOptions.background === 'solid' || subtitleOptions.background === 'rounded_box'
                            ? hexToRgba(subtitleOptions.backgroundColor || '#000000', subtitleOptions.backgroundOpacity ?? 45)
                            : undefined,
                          borderRadius: subtitleOptions.background === 'rounded_box' ? '0.72em' : subtitleOptions.background === 'solid' ? '0.35em' : undefined,
                          padding: subtitleOptions.background === 'solid' || subtitleOptions.background === 'rounded_box' ? '0.22em 0.5em' : undefined,
                          display: subtitleOptions.mode === 'phrase' ? 'block' : 'flex',
                          flexWrap: subtitleOptions.mode === 'phrase' ? undefined : 'wrap',
                          justifyContent: subtitleOptions.mode === 'phrase' ? undefined : 'center',
                          columnGap: subtitleOptions.mode === 'phrase' ? undefined : previewWordGap,
                          rowGap: subtitleOptions.mode === 'phrase' ? undefined : `${((6 / 720) * 100).toFixed(3)}cqh`,
                        }}
                      >
                        {captionWords.map(({ word, active }, index) => (
                          <span
                            key={`${word}-${index}`}
                            className={active && subtitleOptions.activeWordStyle === 'underline' ? 'underline decoration-4 underline-offset-4' : ''}
                            style={{
                              color: active ? subtitleOptions.highlightColor || '#ffeb3b' : subtitleOptions.color || '#ffffff',
                              transform: active && subtitleOptions.activeWordStyle === 'scale' ? 'scale(1.16) translateY(-3px)' : undefined,
                              display: subtitleOptions.mode === 'phrase' ? 'inline' : 'inline-flex',
                              background: subtitleOptions.background === 'active_word_pill'
                                ? hexToRgba(subtitleOptions.backgroundColor || '#000000', subtitleOptions.backgroundOpacity ?? 45)
                                : active && subtitleOptions.activeWordStyle === 'pill'
                                  ? 'rgba(255,235,59,.22)'
                                  : undefined,
                              borderRadius: subtitleOptions.background === 'active_word_pill' || (active && subtitleOptions.activeWordStyle === 'pill') ? '0.8em' : undefined,
                              padding: subtitleOptions.background === 'active_word_pill' ? '0.16em 0.52em' : active && subtitleOptions.activeWordStyle === 'pill' ? '0.02em 0.2em' : undefined,
                              lineHeight: 1.1,
                            }}
                          >
                            {word}{' '}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 xl:flex-[0_0_154px] xl:overflow-hidden">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">Subtitle Timeline</p>
                <h3 className="sr-only">Text and timing</h3>
              </div>
              <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-white/35">{editedTranscript.length} lines</span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div className="min-w-[720px] space-y-1.5">
                <div className="hidden">
                  <div className="absolute inset-x-5 top-8 h-1 rounded-full bg-white/12" />
                  {Array.from({ length: Math.floor(timelineDuration / 5) + 1 }, (_, index) => {
                    const second = index * 5
                    const left = `${(second / timelineDuration) * 100}%`
                    return (
                      <div key={second} className="absolute top-0 bottom-0" style={{ left }}>
                        <div className="absolute top-4 h-3 w-px bg-white/35" />
                        <div className="absolute top-1 -translate-x-1/2 text-[10px] font-semibold text-white/45">{formatTime(second).replace('.0', '')}</div>
                      </div>
                    )
                  })}
                  {Array.from({ length: Math.floor(timelineDuration) + 1 }, (_, second) => second).filter((second) => second % 5 !== 0).map((second) => (
                    <div key={`minor-${second}`} className="absolute top-5 h-2 w-px bg-white/14" style={{ left: `${(second / timelineDuration) * 100}%` }} />
                  ))}
                  <div
                    className="absolute top-1 bottom-1 w-2 rounded-full bg-lime-400 shadow-[0_0_16px_rgba(134,239,172,0.55)]"
                    style={{ left: `${((selectedLine?.start || 0) / timelineDuration) * 100}%`, transform: 'translateX(-50%)' }}
                  />
                </div>

                <div className="relative h-14 overflow-hidden rounded-xl border border-white/10 bg-white/[0.08]" onClick={handleTimelineScrub}>
                  {Array.from({ length: Math.floor(timelineDuration / 5) + 1 }, (_, index) => {
                    const second = index * 5
                    return <div key={`track-major-${second}`} className="absolute top-0 bottom-0 w-px bg-white/12" style={{ left: `${(second / timelineDuration) * 100}%` }} />
                  })}
                  <div className="absolute left-0 right-0 top-1/2 h-px bg-white/12" />

                  {gapMarkers.map((gap) => (
                    <div
                      key={`${gap.start}-${gap.end}`}
                      className="absolute top-2 bottom-2 rounded-md border border-dashed border-white/10 bg-black/10"
                      style={{
                        left: `${(gap.start / timelineDuration) * 100}%`,
                        width: `${((gap.end - gap.start) / timelineDuration) * 100}%`,
                      }}
                    >
                      {gap.duration > 1 && (
                        <div className="flex h-full items-center justify-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/22">
                          {gap.duration.toFixed(1)}s gap
                        </div>
                      )}
                    </div>
                  ))}

                  {editedTranscript.map((line, index) => {
                    const selected = selectedLineIndex === index
                    const top = index % 2 === 0 ? 6 : 29
                    const width = Math.max(10, ((line.end - line.start) / timelineDuration) * 100)
                    const outsideTrim = line.end < trimStart || line.start > trimEnd
                    const displayText = censorSubtitleText(line.text, subtitleOptions.profanityFilter)
                    return (
                      <button
                        key={`${activeClip.id}-${line.start}-${index}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedLineIndex(index)
                          seekPreview(line.start)
                        }}
                        className={`absolute h-6 overflow-hidden rounded-md px-2 py-0.5 text-left transition-all ${outsideTrim ? 'opacity-35' : 'opacity-100'} ${selected ? 'border border-red-400/35 bg-red-500/10 shadow-[0_0_24px_rgba(255,77,77,0.12)]' : 'border border-transparent hover:bg-white/[0.04]'}`}
                        style={{
                          left: `${(line.start / timelineDuration) * 100}%`,
                          top,
                          width: `${width}%`,
                        }}
                        title={displayText}
                      >
                        <div className="pointer-events-none truncate text-[11px] leading-5 text-white">{formatTime(line.start)}  {displayText}</div>
                        <div className={`pointer-events-none absolute inset-x-2 bottom-1 h-px ${selected ? 'bg-red-400/80' : 'bg-white/12'}`} />
                        {selected && (
                          <>
                            <div className="absolute inset-y-1 left-0.5 w-1.5 cursor-ew-resize rounded-full bg-white/80" title="Drag line start" />
                            <div className="absolute inset-y-1 right-0.5 w-1.5 cursor-ew-resize rounded-full bg-white/80" title="Drag line end" />
                          </>
                        )}
                      </button>
                    )
                  })}

                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-lime-400/90 shadow-[0_0_14px_rgba(134,239,172,0.6)]"
                    style={{ left: `${progressPercent}%` }}
                  />
                </div>

                <div ref={trimTrackRef} className="relative h-8 select-none">
                  <div className="absolute left-0 right-0 top-3 h-2 rounded-sm bg-black/45" onClick={handleTimelineScrub} />
                  <div
                    className="absolute top-3 h-2 rounded-sm"
                    style={{
                      left: `${trimStartPercent}%`,
                      width: `${Math.max(0, trimEndPercent - trimStartPercent)}%`,
                      background: 'linear-gradient(90deg, #FF4D4D, #FF5D5D)',
                      boxShadow: '0 0 18px rgba(255,77,77,0.18)',
                    }}
                    onClick={handleTimelineScrub}
                  />
                  <div
                    className="pointer-events-none absolute top-1 bottom-1 w-[2px] bg-lime-300/95 shadow-[0_0_12px_rgba(190,242,100,0.55)]"
                    style={{ left: `${progressPercent}%` }}
                  />
                  <div
                    className={`absolute top-0 h-8 w-3 -translate-x-1/2 cursor-ew-resize rounded-md border border-white/35 bg-white/75 shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-colors ${draggingTrim === 'start' ? 'bg-red-200' : 'hover:bg-white'}`}
                    style={{ left: `${trimStartPercent}%` }}
                    onMouseDown={(event) => handleTrimDrag(event, 'start')}
                    title="Drag clip start"
                  >
                    <div className="absolute inset-y-2 left-1/2 border-l border-black/35" />
                  </div>
                  <div
                    className={`absolute top-0 h-8 w-3 -translate-x-1/2 cursor-ew-resize rounded-md border border-white/35 bg-white/75 shadow-[0_8px_22px_rgba(0,0,0,0.35)] transition-colors ${draggingTrim === 'end' ? 'bg-red-200' : 'hover:bg-white'}`}
                    style={{ left: `${trimEndPercent}%` }}
                    onMouseDown={(event) => handleTrimDrag(event, 'end')}
                    title="Drag clip end"
                  >
                    <div className="absolute inset-y-2 left-1/2 border-l border-black/35" />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-semibold text-white/35">
                  <span>Start {formatTime(trimStart)}</span>
                  <span className="text-white/55">Trim {trimDuration.toFixed(1)}s</span>
                  <span>End {formatTime(trimEnd)}</span>
                </div>
              </div>
            </div>

            {selectedLine && (
              <div className="hidden">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    Edit line - {formatTime(selectedLine.start)} to {formatTime(selectedLine.end)}
                  </div>
                  <button type="button" onClick={() => setSelectedLineIndex(0)} className="text-xs text-white/35 hover:text-white">Clear selection</button>
                </div>
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_86px_86px]">
                  <label className="block">
                    <span className="sr-only">Text</span>
                    <input value={selectedLine.text} onChange={(event) => updateSelectedLine({ text: event.target.value })} className={textInputClass()} aria-label="Selected subtitle line text" />
                  </label>
                  <label className="block">
                    <span className="sr-only">Start</span>
                    <input type="number" min="0" max={Math.max(0, selectedLine.end - 0.1)} step="0.1" value={selectedLine.start} onChange={(event) => updateSelectedLine({ start: clampTime(Number(event.target.value), 0, selectedLine.end - 0.1) })} className={textInputClass()} />
                  </label>
                  <label className="block">
                    <span className="sr-only">End</span>
                    <input type="number" min={selectedLine.start + 0.1} max={timelineDuration} step="0.1" value={selectedLine.end} onChange={(event) => updateSelectedLine({ end: clampTime(Number(event.target.value), selectedLine.start + 0.1, timelineDuration) })} className={textInputClass()} />
                  </label>
                </div>
                <div className="hidden">
                  <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white">Split at Playhead</button>
                  <button type="button" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white">Merge Next</button>
                  <button type="button" className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}>Apply Line</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </section>

        <aside className="space-y-3 transition-opacity duration-150 xl:overflow-y-auto xl:pb-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">Clip Select</p>
                <p className="mt-0.5 text-xs font-semibold text-white/40">{activeClipIndex + 1}/{studioClips.length} selected</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => goToClip(-1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/25 text-lg font-black text-white/55 hover:border-white/20 hover:text-white"
                  aria-label="Previous clip"
                >
                  &lsaquo;
                </button>
                <button
                  type="button"
                  onClick={() => goToClip(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/25 text-lg font-black text-white/55 hover:border-white/20 hover:text-white"
                  aria-label="Next clip"
                >
                  &rsaquo;
                </button>
              </div>
            </div>
            <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1">
              {studioClips.map((clip, index) => {
                const selected = index === activeClipIndex
                const thumbnail = clipThumbnails[clip.id]
                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => selectClip(index)}
                    className={`group grid grid-cols-[104px_minmax(0,1fr)] gap-2 rounded-xl border p-1.5 text-left transition-all ${selected ? 'border-red-400/45 bg-red-500/10 shadow-[0_0_26px_rgba(255,77,77,0.13)]' : 'border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.04]'}`}
                  >
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-black/50">
                      {thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbnail} alt={`Clip ${index + 1} thumbnail`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black/30 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25">Clip</div>
                      )}
                      <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-black ${selected ? 'bg-red-500 text-white' : 'bg-black/70 text-white/75'}`}>{index + 1}</span>
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white/75">{Math.round(clip.duration)}s</span>
                    </div>
                    <div className="min-w-0 py-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-xs font-black ${selected ? 'text-white' : 'text-white/70'}`}>Clip {index + 1}</span>
                        <span className="shrink-0 text-[11px] font-semibold text-white/35">{clip.score}/10</span>
                      </div>
                      <div className={`mt-1 line-clamp-2 text-xs font-semibold leading-4 ${selected ? 'text-white/85' : 'text-white/45'}`}>{clip.title}</div>
                      <div className="mt-1 text-[11px] font-semibold text-white/30">{clip.start}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="grid grid-cols-3 gap-2">
              {[{ id: 'subtitle' as const, label: 'Subtitles' }, { id: 'layout' as const, label: 'Layout' }, { id: 'export' as const, label: 'Export' }].map((panel) => (
                <button key={panel.id} type="button" onClick={() => setOpenPanel(panel.id)} className={`rounded-lg border px-2 py-2 text-center text-xs font-bold transition-all ${openPanel === panel.id ? 'border-red-500/35 bg-red-500/12 text-white' : 'border-white/10 bg-black/20 text-white/45 hover:border-white/20 hover:text-white'}`}>
                  {panel.label}
                </button>
              ))}
            </div>
          </section>
          {openPanel === 'subtitle' && selectedLine && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">Selected Subtitle</p>
                  <p className="mt-0.5 text-xs font-semibold text-white/40">{formatTime(selectedLine.start)} to {formatTime(selectedLine.end)}</p>
                </div>
                <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-semibold text-white/35">Line {selectedLineIndex + 1}</span>
              </div>
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Text</span>
                  <input value={selectedLine.text} onChange={(event) => updateSelectedLine({ text: event.target.value })} className={textInputClass()} aria-label="Selected subtitle line text" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Start</span>
                    <input type="number" min="0" max={Math.max(0, selectedLine.end - 0.1)} step="0.1" value={selectedLine.start} onChange={(event) => updateSelectedLine({ start: clampTime(Number(event.target.value), 0, selectedLine.end - 0.1) })} className={textInputClass()} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">End</span>
                    <input type="number" min={selectedLine.start + 0.1} max={timelineDuration} step="0.1" value={selectedLine.end} onChange={(event) => updateSelectedLine({ end: clampTime(Number(event.target.value), selectedLine.start + 0.1, timelineDuration) })} className={textInputClass()} />
                  </label>
                </div>
              </div>
            </section>
          )}
          {openPanel === 'subtitle' && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Subtitle Studio</p>
                  <h3 className="mt-1 text-xl font-black text-white">Full Slicer controls</h3>
                </div>
                <button type="button" onClick={() => updateSubtitleOptions({ enabled: !subtitleOptions.enabled })} className={buttonClass(subtitleOptions.enabled)}>{subtitleOptions.enabled ? 'On' : 'Off'}</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Preset</label>
                  <select value={subtitleOptions.preset} onChange={(event) => setSubtitleOptions((current) => applyPreset(current, event.target.value as SubtitlePreset))} className={selectClass()}>
                    {SUBTITLE_PRESETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] leading-5 text-white/30">{presetDetails.desc}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={buttonClass(Boolean(subtitleOptions.autoKeywords))} onClick={() => updateSubtitleOptions({ autoKeywords: !subtitleOptions.autoKeywords })}>Auto Keywords</button>
                  <button type="button" className={buttonClass(Boolean(subtitleOptions.profanityFilter))} onClick={() => updateSubtitleOptions({ profanityFilter: !subtitleOptions.profanityFilter })}>Emoji Censor</button>
                  <button type="button" className={buttonClass(Boolean(subtitleOptions.shadow))} onClick={() => updateSubtitleOptions({ shadow: !subtitleOptions.shadow })}>Shadow</button>
                  <button type="button" className={buttonClass(Boolean(subtitleOptions.watermarkEnabled))} onClick={() => updateSubtitleOptions({ watermarkEnabled: !subtitleOptions.watermarkEnabled })}>Watermark</button>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Mode</label>
                  <div className="grid gap-2">
                    {SUBTITLE_MODE_OPTIONS.map((option) => (
                      <button key={option.value} type="button" onClick={() => updateSubtitleOptions({ mode: option.value })} className={buttonClass(subtitleOptions.mode === option.value)}>
                        <span className="block">{option.label}</span>
                        <span className="mt-0.5 block text-[11px] text-white/30">{option.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Safe Zone</label>
                  <select value={subtitleOptions.safeZone} onChange={(event) => updateSubtitleOptions({ safeZone: event.target.value as SubtitleSafeZone })} className={selectClass()}>
                    {SAFE_ZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {subtitleOptions.safeZone === 'custom' && (
                    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between text-xs"><span className="font-bold uppercase tracking-[0.16em] text-white/35">Offset</span><span className="font-semibold text-white">{safeZoneOffset}%</span></div>
                      <input type="range" min="0" max={CUSTOM_SAFE_ZONE_OFFSET_MAX} value={safeZoneOffset} onChange={(event) => setSafeZoneOffset(Number(event.target.value))} className="w-full accent-red-500" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Font</span><select value={subtitleOptions.font} onChange={(event) => updateSubtitleOptions({ font: event.target.value as SubtitleFont })} className={selectClass()}>{FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Size</span><select value={subtitleOptions.size} onChange={(event) => updateSubtitleOptions({ size: event.target.value as SubtitleSize })} className={selectClass()}>{SIZE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Text</span><input type="color" value={subtitleOptions.color || '#ffffff'} onChange={(event) => updateSubtitleOptions({ color: event.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 p-1" /></label>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Highlight</span><input type="color" value={subtitleOptions.highlightColor || '#ffeb3b'} onChange={(event) => updateSubtitleOptions({ highlightColor: event.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 p-1" /></label>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Outline</span><input type="color" value={subtitleOptions.outlineColor || '#000000'} onChange={(event) => updateSubtitleOptions({ outlineColor: event.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 p-1" /></label>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Outline Thickness</label>
                  <div className="grid grid-cols-4 gap-2">{OUTLINE_OPTIONS.map((option) => <button key={option.value} type="button" onClick={() => updateSubtitleOptions({ outlineThickness: option.value })} className={buttonClass(subtitleOptions.outlineThickness === option.value)}>{option.label}</button>)}</div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Background</label>
                  <select value={subtitleOptions.background} onChange={(event) => updateSubtitleOptions({ background: event.target.value as SubtitleBackground })} className={selectClass()}>{BACKGROUND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  {subtitleOptions.background !== 'none' && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-[80px_minmax(0,1fr)]">
                      <input type="color" value={subtitleOptions.backgroundColor || '#000000'} onChange={(event) => updateSubtitleOptions({ backgroundColor: event.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 p-1" />
                      <div><div className="mb-1 flex justify-between text-[11px] text-white/35"><span>Opacity</span><span>{subtitleOptions.backgroundOpacity ?? 45}%</span></div><input type="range" min="0" max="100" step="5" value={subtitleOptions.backgroundOpacity ?? 45} onChange={(event) => updateSubtitleOptions({ backgroundOpacity: Number(event.target.value) })} className="w-full accent-red-500" /></div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Motion</span><select value={subtitleOptions.animationPreset} onChange={(event) => updateSubtitleOptions({ animationPreset: event.target.value as SubtitleAnimationPreset })} className={selectClass()}>{ANIMATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Active</span><select value={subtitleOptions.activeWordStyle} onChange={(event) => updateSubtitleOptions({ activeWordStyle: event.target.value as ActiveWordStyle })} className={selectClass()}>{ACTIVE_WORD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Case</span><select value={subtitleOptions.textCase} onChange={(event) => updateSubtitleOptions({ textCase: event.target.value as SubtitleCase })} className={selectClass()}>{CASE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={buttonClass(false)}>Load Brand Kit</button>
                  <button type="button" className={buttonClass(false)}>Save Brand Kit</button>
                </div>
              </div>
            </section>
          )}

          {openPanel === 'layout' && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Clip Layout</p><h3 className="mt-1 text-xl font-black text-white">Canvas and trim</h3></div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">{(['twitter', 'tiktok', 'youtube_shorts', 'custom'] as ExportFormat[]).map((item) => <button key={item} type="button" onClick={() => setFormat(item)} className={buttonClass(format === item)}><span className="block">{FORMAT_LABELS[item]}</span><span className="mt-0.5 block text-[11px] text-white/30">{item}</span></button>)}</div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="mb-3 flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-[0.16em] text-white/35">Trim Window</span>
                    <span className="font-semibold text-white">{trimDuration.toFixed(1)}s</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">Start</span>
                      <input
                        type="number"
                        min="0"
                        max={Math.max(0, trimEnd - MIN_TRIM_DURATION)}
                        step="0.1"
                        value={Number(trimStart.toFixed(1))}
                        onChange={(event) => {
                          const nextStart = clampTime(Number(event.target.value), 0, trimEnd - MIN_TRIM_DURATION)
                          setTrimStart(nextStart)
                          seekPreview(nextStart, isPlaying)
                        }}
                        className={textInputClass()}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">Finish</span>
                      <input
                        type="number"
                        min={trimStart + MIN_TRIM_DURATION}
                        max={timelineDuration}
                        step="0.1"
                        value={Number(trimEnd.toFixed(1))}
                        onChange={(event) => {
                          const nextEnd = clampTime(Number(event.target.value), trimStart + MIN_TRIM_DURATION, timelineDuration)
                          setTrimEnd(nextEnd)
                          if (playheadTime > nextEnd) seekPreview(nextEnd, isPlaying)
                        }}
                        className={textInputClass()}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTrimStart(0)
                      setTrimEnd(timelineDuration)
                      seekPreview(0, false)
                    }}
                    className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/55 hover:text-white"
                  >
                    Reset to Full Clip
                  </button>
                </div>
              </div>
            </section>
          )}

          {openPanel === 'export' && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Export Queue</p><h3 className="mt-1 text-xl font-black text-white">Final settings</h3></div>
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white/75">{FORMAT_LABELS[format]} video render</span>
                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/35">{subtitleOptions.watermarkEnabled === false ? 'no watermark' : 'watermark on'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={exportActiveClip}
                    disabled={isExporting || !activeClip.sourceUrl}
                    className="mt-3 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-55"
                    style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}
                  >
                    {isExporting ? exportStatus || 'Exporting...' : 'Export Clip'}
                  </button>
                  {exportStatus && <p className="mt-2 text-xs font-semibold text-white/40">{exportStatus}</p>}
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}
