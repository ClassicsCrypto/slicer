'use client'

import Image from 'next/image'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Job, Clip, SubtitleOptions, ProofFrame } from '@/types'
import { getApiUrl } from '@/lib/api-url'
import { getClipStableId } from '@/lib/clip-id'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ClipPreviewEditor from '@/components/dashboard/ClipPreviewEditor'
import ProcessingView from '@/components/dashboard/ProcessingView'

interface ClipsGalleryProps {
  initialJobs?: Job[]
}

function DownloadClipButton({ clip, sourceUrl, title, subtitleOptions, aspectRatio, trimStart, trimEnd, originalStartTime, onAspectRatioChange, onWatermarkToggle }: { clip: Clip; sourceUrl: string; title: string; subtitleOptions?: import('@/types').SubtitleOptions; aspectRatio?: string; trimStart?: number | null; trimEnd?: number | null; originalStartTime?: number; onAspectRatioChange?: (ratio: string) => void; onWatermarkToggle?: (enabled: boolean) => void }) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState('')
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(aspectRatio || 'custom')
  const watermarkEnabled = subtitleOptions?.watermarkEnabled !== false

  useEffect(() => {
    setSelectedAspectRatio(aspectRatio || 'custom')
  }, [aspectRatio])

  const handleAspectRatioChange = (ratio: string) => {
    setSelectedAspectRatio(ratio)
    if (onAspectRatioChange) onAspectRatioChange(ratio)
  }

  const handleDownload = async () => {
    setDownloading(true)
    setProgress('Cutting clip...')

    console.log('[Slicer] Export clip subtitles:', clip.subtitles?.length || 0, 'words')
    console.log('[Slicer] First 3 words:', JSON.stringify(clip.subtitles?.slice(0, 3)))
    console.log('[Slicer] Subtitle options sent:', JSON.stringify(subtitleOptions))
    console.log('[Slicer] Aspect ratio:', selectedAspectRatio)
    console.log('[Slicer] Times - clip.start_time:', clip.start_time, 'trimStart:', trimStart, 'trimEnd:', trimEnd, 'originalStartTime:', originalStartTime)

    try {
      const apiBase = await getApiUrl()
      const res = await fetch(`${apiBase}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: sourceUrl,
          startTime: trimStart ?? clip.start_time,
          endTime: trimEnd ?? clip.end_time,
          title: `${title}-clip-${(trimStart ?? clip.start_time).toFixed(0)}s`,
          subtitles: clip.subtitles || [],
          subtitleOptions: subtitleOptions || {
            enabled: true, size: 'medium', color: '#ffffff', position: 'bottom',
            style: 'bold', background: 'none', font: 'impact', mode: 'active_word', preset: 'auto', animationPreset: 'pop',
            highlightColor: '#ffeb3b', activeWordStyle: 'pill', safeZone: 'bottom_safe',
            outlineThickness: 'thick', outlineColor: '#000000', shadow: true, textCase: 'original', watermarkEnabled: true,
          },
          aspectRatio: selectedAspectRatio,
          originalStartTime: originalStartTime ?? clip.start_time,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }))
        setProgress(err.error || 'Export failed')
        setTimeout(() => { setDownloading(false); setProgress('') }, 3000)
        return
      }

      // Download the blob
      setProgress('Downloading...')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}-clip-${clip.start_time.toFixed(0)}s.mp4`
      a.click()
      URL.revokeObjectURL(url)

      setProgress('Done!')
      setTimeout(() => { setDownloading(false); setProgress('') }, 2000)
    } catch {
      setProgress('Server not available')
      setTimeout(() => { setDownloading(false); setProgress('') }, 3000)
    }
  }

  return (
    <div className="flex-1 space-y-2">
      {/* Aspect Ratio Selector */}
      <div>
        <label className="block text-[10px] text-white/40 mb-1 uppercase tracking-wider">Export Format</label>
        <div className="grid grid-cols-4 gap-1">
          {[
            { value: 'twitter', label: '16:9', desc: 'Landscape' },
            { value: 'tiktok', label: '9:16', desc: 'Portrait' },
            { value: 'youtube_shorts', label: '1:1', desc: 'Square' },
            { value: 'custom', label: 'Original', desc: 'No crop' },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleAspectRatioChange(opt.value)}
              className={`py-2 px-1 rounded text-[10px] font-semibold transition-all ${
                selectedAspectRatio === opt.value
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-white/5 text-white/40 border border-white/10 hover:border-white/20'
              }`}
              title={opt.desc}
            >
              <div>{opt.label}</div>
              <div className="text-[8px] text-white/30">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onWatermarkToggle?.(!watermarkEnabled)}
          className={`min-w-[132px] rounded-lg border px-3 py-2.5 text-sm font-semibold transition-all ${watermarkEnabled ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-white/10 bg-black/20 text-white/55 hover:border-white/20'}`}
        >
          Watermark {watermarkEnabled ? 'On' : 'Off'}
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}
        >
          {downloading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {progress}
            </span>
          ) : (
            'Export Clip'
          )}
        </button>
      </div>
    </div>
  )
}

function formatCategory(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function cleanClipReason(reason?: string): string {
  const cleaned = (reason || '')
    .replace(/^reason\s*[:\-]\s*/i, '')
    .replace(/^this clip was selected because\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return 'Selected by the scorer.'
  return cleaned[0].toUpperCase() + cleaned.slice(1)
}

function slugifyFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'slicer'
}

async function downloadImageUrl(url: string, fileName: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Still download failed')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

function formatClipShortfallReason(requested: number, delivered: number, raw?: string): string | null {
  if (requested <= delivered) return null

  if (raw && /fewer unique moments/i.test(raw)) {
    return `Requested ${requested}, delivered ${delivered}. The scorer finished cleanly but only found ${delivered} distinct moments worth keeping.`
  }

  return raw || `Requested ${requested}, delivered ${delivered}. This run finished, but only ${delivered} clip${delivered === 1 ? '' : 's'} made the final cut.`
}

function formatFailureReason(raw?: string): string | null {
  const text = raw?.trim()
  if (!text) return null
  if (/503/.test(text) || /UNAVAILABLE/i.test(text)) {
    return 'Gemini got overloaded during scoring. Hit Retry and it should usually recover on the next pass.'
  }
  if (/0 clips/i.test(text)) {
    return 'The scorer finished but did not find enough usable moments in this run. Retry or rescore it.'
  }
  if (/No usable audio track found/i.test(text)) {
    return 'No usable audio track was found in the source media.'
  }
  return text.replace(/\s+/g, ' ')
}

function ClipCard({
  clip,
  sourceUrl,
  onPreview,
  onDelete,
  onVote,
}: {
  clip: Clip
  sourceUrl: string
  onPreview: (clip: Clip) => void
  onDelete: (clipId: string) => void
  onVote: (clipId: string, value: 'up' | 'down' | 'neutral') => void
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [voting, setVoting] = useState(false)
  const clipDuration = Number.isFinite(clip.duration) ? clip.duration : Math.max(0, clip.end_time - clip.start_time)
  const proofFrameKey = useMemo(() => JSON.stringify(clip.proof_frames || []), [clip.proof_frames])
  const currentVote = clip.vote?.value

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const apiBase = (await getApiUrl()).replace(/\/$/, '')
        const proofFrames = JSON.parse(proofFrameKey || '[]') as ProofFrame[]
        const primaryFrame = proofFrames.find((frame) => frame.label === 'best') || proofFrames[0]
        const midTime = Math.max(0, primaryFrame?.timestamp ?? (clip.start_time + (clipDuration / 2)))
        const url = new URL(`${apiBase}/thumbnail`)
        url.searchParams.set('sourceUrl', sourceUrl)
        url.searchParams.set('timestamp', midTime.toFixed(2))
        url.searchParams.set('clipId', clip.id)
        if (!cancelled) {
          setThumbUrl(url.toString())
        }
      } catch {
        if (!cancelled) {
          setThumbUrl(null)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sourceUrl, clip.start_time, clip.end_time, clipDuration, clip.id, proofFrameKey])

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20 transition-all hover:border-white/20 group">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black/50 flex items-center justify-center cursor-pointer" onClick={() => onPreview(clip)}>
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="Clip thumbnail" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black/30">
            <span className="w-6 h-6 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm shadow-lg group-hover:scale-110 transition-transform"
            style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}
          >
            ▶
          </div>
        </div>
        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-mono">
          {Math.round(clipDuration)}s
        </div>
        {/* Virality score moved to description area below */}
      </div>

      {/* Info */}
      <div className="p-3">
        {clip.virality_score !== undefined && (
          <div className={`text-xs font-semibold mb-1 ${
            clip.virality_score >= 8 ? 'text-red-400' : clip.virality_score >= 6 ? 'text-yellow-400' : 'text-white/40'
          }`}>
            Score {clip.virality_score}/10 - {
              clip.virality_score >= 10 ? 'VIRAL'
              : clip.virality_score >= 8 ? 'Incredible'
              : clip.virality_score >= 6 ? 'Solid'
              : clip.virality_score >= 4 ? 'Decent'
              : 'Low'
            }
          </div>
        )}
        <p className="text-xs text-white/40 mb-2 line-clamp-2">{cleanClipReason(clip.ai_reason)}</p>
        <div className="flex flex-wrap gap-1">
          {clip.matched_categories.slice(0, 3).map((cat) => (
            <Badge key={cat} variant="dark">{formatCategory(cat)}</Badge>
          ))}
        </div>
        <div className="mt-3 rounded-lg border border-white/8 bg-black/20 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">Teach Slicer</div>
          <div className="grid grid-cols-3 gap-1">
            {([
              ['up', 'Good', '👍'],
              ['down', 'Miss', '👎'],
              ['neutral', 'Meh', '➖'],
            ] as const).map(([value, label, icon]) => (
              <button
                key={value}
                type="button"
                disabled={voting}
                onClick={async () => {
                  setVoting(true)
                  await Promise.resolve(onVote(getClipStableId(clip), value))
                  setVoting(false)
                }}
                className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-50 ${
                  currentVote === value
                    ? value === 'up'
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : value === 'down'
                        ? 'border-red-400/40 bg-red-500/15 text-red-200'
                        : 'border-white/25 bg-white/10 text-white/80'
                    : 'border-white/10 bg-white/5 text-white/45 hover:border-white/20 hover:text-white/80'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onPreview(clip)}
            className="min-w-[88px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition-all hover:border-white/20 hover:text-white"
          >
            Preview
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this clip?')) {
                setDeleting(true)
                onDelete(getClipStableId(clip))
              }
            }}
            disabled={deleting}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-all hover:bg-red-500/20 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

type StillShot = {
  id: string
  thumbUrl: string
  hqUrl: string
  fileName: string
  clipLabel: string
  frameLabel: string
  timestamp: number
  score?: number
  reason?: string
}

type StillFormat = 'jpg' | 'png'
type StillCrop = 'original' | 'square' | 'portrait'

function JobStillShotsFolder({ job, clips }: { job: Job; clips: Clip[] }) {
  const [apiBase, setApiBase] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [previewStill, setPreviewStill] = useState<StillShot | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [stillFormat, setStillFormat] = useState<StillFormat>('jpg')
  const [stillCrop, setStillCrop] = useState<StillCrop>('original')
  const [currentStillIndex, setCurrentStillIndex] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const nextApiBase = (await getApiUrl()).replace(/\/$/, '')
        if (!cancelled) setApiBase(nextApiBase)
      } catch {
        if (!cancelled) setApiBase(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const stills = useMemo<StillShot[]>(() => {
    if (!apiBase || !job.source_url) return []
    const jobSlug = slugifyFilePart(job.title || job.id)

    return clips.flatMap((clip, clipIndex) => {
      const clipId = getClipStableId(clip)
      const proofFrames = clip.proof_frames?.length
        ? clip.proof_frames
        : [{ label: 'mid', timestamp: clip.start_time + Math.max(0, (clip.end_time - clip.start_time) / 2), score: clip.virality_score, reason: clip.ai_reason }]

      return proofFrames.map((frame, frameIndex) => {
        const frameLabel = frame.label || `still-${frameIndex + 1}`
        const timestamp = Math.max(0, Number(frame.timestamp || 0))
        const thumbParams = new URLSearchParams()
        thumbParams.set('sourceUrl', job.source_url)
        thumbParams.set('timestamp', timestamp.toFixed(2))
        thumbParams.set('clipId', `${clipId}-${frameLabel}`)
        const hqParams = new URLSearchParams(thumbParams)
        hqParams.delete('clipId')
        hqParams.set('format', stillFormat)
        hqParams.set('crop', stillCrop)
        // Download/preview must match the exact carousel frame the user selected.
        // Earlier qualitySearch=true could jump to a nearby sharper frame, which made the
        // saved still differ from the visible selected still.
        hqParams.set('qualitySearch', 'false')
        hqParams.set('previewVersion', `still-export-v5-${stillCrop}-${stillFormat}`)
        hqParams.set('fileName', `${jobSlug}-clip-${String(clipIndex + 1).padStart(2, '0')}-${slugifyFilePart(frameLabel)}-${Math.round(timestamp)}s`)

        const hqUrl = `/api/stills/export?${hqParams.toString()}`

        return {
          id: `${clipId}-${frameLabel}-${frameIndex}`,
          // Still-shot previews must use the same export route as downloads so the
          // visible thumbnail matches the selected crop/format instead of always
          // showing the generic 16:9 clip thumbnail.
          thumbUrl: hqUrl,
          hqUrl,
          fileName: `${jobSlug}-clip-${String(clipIndex + 1).padStart(2, '0')}-${slugifyFilePart(frameLabel)}-${stillCrop}-${Math.round(timestamp)}s.${stillFormat}`,
          clipLabel: `Clip ${clipIndex + 1}`,
          frameLabel: frameLabel === 'best' ? 'Best Still' : frameLabel,
          timestamp,
          score: frame.score,
          reason: frame.reason || clip.ai_reason,
        }
      })
    })
  }, [apiBase, clips, job.id, job.source_url, job.title, stillCrop, stillFormat])

  useEffect(() => {
    setCurrentStillIndex(0)
    setPreviewStill(null)
  }, [stillCrop, stillFormat, open])

  useEffect(() => {
    if (open) setStillCrop('original')
  }, [open])

  const currentStill = stills[currentStillIndex] || null

  const moveCarousel = (delta: number) => {
    if (!stills.length) return
    setPreviewStill(null)
    setCurrentStillIndex((prev) => (prev + delta + stills.length) % stills.length)
  }

  if (!clips.length) return null

  const handleDownloadAll = async () => {
    if (!stills.length) return
    setDownloading(true)
    try {
      for (const still of stills) {
        // Keep it serialized so browsers do not block the whole batch.
        // eslint-disable-next-line no-await-in-loop
        await downloadImageUrl(still.hqUrl, still.fileName)
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div className="mb-4 rounded-2xl border border-yellow-400/15 bg-yellow-400/[0.04] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-left transition-all hover:border-yellow-300/40 hover:bg-yellow-300/5"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-300/10 text-2xl">📁</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white group-hover:text-yellow-100">Still shots folder</div>
              <div className="text-xs text-white/45">{stills.length || clips.length} high-quality frame{(stills.length || clips.length) === 1 ? '' : 's'} · {stillCrop} · {stillFormat.toUpperCase()} · click to preview</div>
            </div>
          </button>
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={!stills.length || downloading}
            className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-xs font-semibold text-yellow-100 transition-all hover:bg-yellow-300/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? 'Downloading stills...' : 'Download all stills'}
          </button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => { setOpen(false); setPreviewStill(null) }}
        title={`Still shots — ${job.title}`}
        maxWidth="max-w-6xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Post-ready still exports</div>
                <div className="mt-1 text-xs text-white/55">{stills.length} still shot{stills.length === 1 ? '' : 's'} grouped under this job. Opens in 16:9 format by default; crop buttons update both preview and download.</div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">Crop</label>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-1">
                    {[
                      { value: 'portrait', label: '9:16' },
                      { value: 'square', label: '1:1' },
                      { value: 'original', label: '16:9' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setStillCrop(opt.value as StillCrop); setPreviewStill(null) }}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all ${stillCrop === opt.value ? 'bg-red-500/20 text-red-200' : 'text-white/45 hover:bg-white/5 hover:text-white/75'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">Format</label>
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/25 p-1">
                    {(['jpg', 'png'] as StillFormat[]).map((format) => (
                      <button
                        key={format}
                        type="button"
                        onClick={() => { setStillFormat(format); setPreviewStill(null) }}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase transition-all ${stillFormat === format ? 'bg-red-500/20 text-red-200' : 'text-white/45 hover:bg-white/5 hover:text-white/75'}`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={!stills.length || downloading}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition-all hover:border-white/20 hover:text-white disabled:opacity-50"
                >
                  {downloading ? 'Downloading...' : `Download all ${stillFormat.toUpperCase()}`}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-black/30 p-4 md:p-6">
            {currentStill ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                  <div className="relative flex min-h-[440px] items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_center,rgba(255,77,77,0.12),transparent_58%)]">
                    <button
                      type="button"
                      onClick={() => moveCarousel(-1)}
                      className="absolute left-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/55 text-2xl text-white/80 transition-all hover:border-red-300/40 hover:text-white"
                      aria-label="Previous still"
                    >
                      ‹
                    </button>

                    <div className="relative flex h-[440px] w-full max-w-5xl items-center justify-center">
                      {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
                        if (!stills.length) return null
                        const index = (currentStillIndex + offset + stills.length) % stills.length
                        const still = stills[index]
                        const active = offset === 0
                        const absOffset = Math.abs(offset)
                        if (!still || (stills.length === 1 && !active)) return null
                        const activeWidth = stillCrop === 'portrait' ? 288 : stillCrop === 'square' ? 420 : 640
                        const activeHeight = stillCrop === 'portrait' ? 512 : stillCrop === 'square' ? 420 : 360
                        const sideGap = stillCrop === 'portrait' ? 54 : stillCrop === 'square' ? 76 : 108
                        const scale = active ? 1 : absOffset === 1 ? 0.88 : absOffset === 2 ? 0.76 : 0.64
                        const opacity = active ? 1 : absOffset === 1 ? 0.78 : absOffset === 2 ? 0.55 : 0.36
                        const zIndex = active ? 40 : 40 - absOffset

                        return (
                          <div
                            key={`${still.id}-${offset}-${stillCrop}-${stillFormat}`}
                            className={`absolute overflow-hidden rounded-2xl border bg-black shadow-2xl transition-all duration-300 ${active ? 'border-red-400/45 shadow-red-950/30' : 'border-white/10 hover:border-white/25'}`}
                            style={{
                              width: `${activeWidth}px`,
                              height: `${activeHeight}px`,
                              maxWidth: 'calc(100vw - 16rem)',
                              transform: `translateX(${offset * sideGap}px) scale(${scale})`,
                              transformOrigin: 'center center',
                              opacity,
                              zIndex,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => active ? setPreviewStill(still) : setCurrentStillIndex(index)}
                              className="block h-full w-full overflow-hidden rounded-2xl text-left"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img key={still.thumbUrl} src={still.thumbUrl} alt={`${still.clipLabel} ${still.frameLabel}`} className="h-full w-full object-cover" />
                              <span className={`absolute bottom-3 left-3 rounded px-2 py-1 text-[10px] font-semibold uppercase text-white/90 ${still.frameLabel === 'Best Still' ? 'bg-red-500/85' : 'bg-black/70'}`}>{still.frameLabel}</span>
                              {active && <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white/75">{stillCrop === 'portrait' ? '9:16' : stillCrop === 'square' ? '1:1' : '16:9'} preview</span>}
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => moveCarousel(1)}
                      className="absolute right-3 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/55 text-2xl text-white/80 transition-all hover:border-red-300/40 hover:text-white"
                      aria-label="Next still"
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">{currentStill.clipLabel} · {currentStill.frameLabel}</div>
                    <div className="text-xs text-white/45">{currentStillIndex + 1}/{stills.length} · {Math.round(currentStill.timestamp)}s target · {stillCrop} · {stillFormat.toUpperCase()}{currentStill.score ? ` · score ${currentStill.score}/10` : ''}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewStill(currentStill)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition-all hover:border-white/20 hover:text-white"
                    >
                      Full preview
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadImageUrl(currentStill.hqUrl, currentStill.fileName)}
                      className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition-all hover:bg-red-500/15"
                    >
                      Download this still
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center text-sm text-white/45">No stills found for this job.</div>
            )}
          </div>

          {previewStill && (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={previewStill.hqUrl} src={previewStill.hqUrl} alt={`${previewStill.clipLabel} ${previewStill.frameLabel}`} className="max-h-[72vh] w-full object-contain" />
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

function JobCard({
  job,
  onDelete,
  onRetry,
  onRescore,
  onJobComplete,
  onClipDelete,
  onClipVote,
}: {
  job: Job
  onDelete: (id: string) => void
  onRetry: (id: string) => void
  onRescore: (id: string) => void
  onJobComplete: (job: Job) => void
  onClipDelete: (jobId: string, clipId: string) => void
  onClipVote: (jobId: string, clipId: string, value: 'up' | 'down' | 'neutral') => void
}) {
  const [previewClip, setPreviewClip] = useState<Clip | null>(null)
  const [trimmedStart, setTrimmedStart] = useState<number | null>(null)
  const [trimmedEnd, setTrimmedEnd] = useState<number | null>(null)
  const [clipSubtitleOptions, setClipSubtitleOptions] = useState<Record<string, SubtitleOptions>>({})
  const [clipAspectRatios, setClipAspectRatios] = useState<Record<string, string>>({})
  const [clipEdits, setClipEdits] = useState<Record<string, Clip>>({})

  const defaultSubtitleOptions: SubtitleOptions = job.options?.subtitles
    ? { ...job.options.subtitles }
    : {
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
      }

  const getClipSubtitleOptions = (clipId: string): SubtitleOptions => (
    clipSubtitleOptions[clipId] ? { ...clipSubtitleOptions[clipId] } : { ...defaultSubtitleOptions }
  )

  const updateClipSubtitleOptions = (clipId: string, nextOptions: SubtitleOptions) => {
    setClipSubtitleOptions((prev) => ({ ...prev, [clipId]: nextOptions }))
  }

  const getClipAspectRatio = (clipId: string) => clipAspectRatios[clipId] || 'custom'

  const updateClipAspectRatio = (clipId: string, nextRatio: string) => {
    setClipAspectRatios((prev) => ({ ...prev, [clipId]: nextRatio }))
  }

  const isProcessing = job.status === 'processing'
  const clips = (job.clips ?? []).map((clip) => {
    const clipId = getClipStableId(clip)
    return clipEdits[clipId] ? { ...clipEdits[clipId] } : { ...clip, id: clipId }
  })
  const requestedClipCount = job.progress?.requestedClipCount ?? job.options?.clipCount ?? clips.length
  const deliveredClipCount = job.progress?.deliveredClipCount ?? clips.length
  const streamContext = job.progress?.streamContext
  const clipShortfallReason = formatClipShortfallReason(requestedClipCount, deliveredClipCount, job.progress?.clipShortfallReason)
  const failureReason = formatFailureReason(job.progress?.progress)
  const previewDuration = previewClip
    ? (Number.isFinite(previewClip.duration) ? previewClip.duration : Math.max(0, previewClip.end_time - previewClip.start_time))
    : 0

  const handleClipDelete = (clipId: string) => {
    setClipEdits((prev) => {
      const next = { ...prev }
      delete next[clipId]
      return next
    })
    onClipDelete(job.id, clipId)
  }

  const handlePreviewClipChange = (updatedClip: Clip) => {
    setClipEdits((prev) => ({ ...prev, [updatedClip.id]: updatedClip }))
    setPreviewClip(updatedClip)
  }

  const handleManifestDownload = async () => {
    const res = await fetch(`/api/jobs/${job.id}/manifest`)
    if (!res.ok) return
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data.manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugifyFilePart(job.title)}-clip-manifest.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const previewSubtitleOptions = previewClip ? getClipSubtitleOptions(previewClip.id) : defaultSubtitleOptions
  const previewAspectRatio = previewClip ? getClipAspectRatio(previewClip.id) : 'custom'

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      {/* Job header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{job.title}</h3>
          <p className="text-xs text-white/30 mt-0.5">{timeAgo(job.created_at)}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-white/45">
            <span>Requested {requestedClipCount}</span>
            <span>•</span>
            <span>Delivered {deliveredClipCount}</span>
            {streamContext && (
              <>
                <span>•</span>
                <span className="truncate max-w-[220px]">{streamContext}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {job.status === 'complete' && (
            <Badge variant="green">Done {deliveredClipCount} clips</Badge>
          )}
          {job.status === 'processing' && (
            <Badge variant="dark">Processing</Badge>
          )}
          {job.status === 'failed' && (
            <Badge variant="red">Failed</Badge>
          )}
          {job.status === 'failed' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRetry(job.id) }}
              className="text-white/50 hover:text-white"
            >
              Retry
            </Button>
          )}
          {job.status === 'complete' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleManifestDownload() }}
              className="text-white/40 hover:text-white"
            >
              Manifest
            </Button>
          )}
          {job.status === 'complete' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRescore(job.id) }}
              className="text-white/40 hover:text-white"
            >
              Rescore
            </Button>
          )}
          {job.status !== 'processing' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onDelete(job.id) }}
              className="text-white/30 hover:text-red-400"
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {!!clipShortfallReason && !isProcessing && (
          <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/80">
            {clipShortfallReason}
          </div>
        )}
        {job.status === 'failed' && failureReason && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-100/80">
            {failureReason}
          </div>
        )}
        {isProcessing ? (
          <ProcessingView job={job} onComplete={onJobComplete} />
        ) : clips.length > 0 ? (
          <>
            <JobStillShotsFolder job={job} clips={clips} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {clips.map((clip) => (
                <ClipCard
                  key={getClipStableId(clip)}
                  clip={clip}
                  sourceUrl={job.source_url}
                  onPreview={setPreviewClip}
                  onDelete={handleClipDelete}
                  onVote={(clipId, value) => onClipVote(job.id, clipId, value)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-6">
            <div className="relative flex min-h-[180px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] px-6 py-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,77,77,0.12),transparent_62%)]" />
              <Image
                src="/slicer-watermark-white.png"
                alt="Slicer watermark"
                width={1024}
                height={1024}
                className="relative z-10 h-auto w-[260px] opacity-30 drop-shadow-[0_0_42px_rgba(255,77,77,0.16)] md:w-[360px]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewClip && (
        <Modal
          open={!!previewClip}
          onClose={() => setPreviewClip(null)}
          title={`Clip - ${Math.round(previewDuration)}s`}
          maxWidth="max-w-5xl"
        >
          <ClipPreviewEditor
            clip={previewClip}
            jobTitle={job.title}
            sourceUrl={job.source_url}
            subtitleOptions={previewSubtitleOptions}
            exportAspectRatio={previewAspectRatio as 'twitter' | 'tiktok' | 'youtube_shorts' | 'custom'}
            onSubtitleOptionsChange={(next) => updateClipSubtitleOptions(previewClip.id, next)}
            onClipChange={handlePreviewClipChange}
            onTrimChange={(s, e) => { setTrimmedStart(s); setTrimmedEnd(e) }}
            onExportAspectRatioChange={(ratio) => updateClipAspectRatio(previewClip.id, ratio)}
          >
            <div className="pt-3 flex gap-2">
              <DownloadClipButton
                clip={previewClip}
                sourceUrl={job.source_url}
                title={job.title}
                subtitleOptions={previewSubtitleOptions}
                aspectRatio={previewAspectRatio}
                onAspectRatioChange={(ratio) => updateClipAspectRatio(previewClip.id, ratio)}
                trimStart={trimmedStart}
                trimEnd={trimmedEnd}
                originalStartTime={previewClip.start_time}
                onWatermarkToggle={(enabled) => updateClipSubtitleOptions(previewClip.id, { ...previewSubtitleOptions, watermarkEnabled: enabled })}
              />
            </div>
          </ClipPreviewEditor>
        </Modal>
      )}
    </div>
  )
}

export default function ClipsGallery({ initialJobs = [] }: ClipsGalleryProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs')
      if (!res.ok) return
      const data = await res.json()
      setJobs(data.jobs ?? [])
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    // Fetch immediately + after short delays to catch newly completed jobs
    fetchJobs()
    const t1 = setTimeout(fetchJobs, 1500)
    const t2 = setTimeout(fetchJobs, 4000)
    // Then auto-refresh every 15s
    const interval = setInterval(fetchJobs, 15000)
    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(interval) }
  }, [fetchJobs])

  // Also merge initialJobs (from onJobCreated) into state
  useEffect(() => {
    if (initialJobs.length > 0) {
      setJobs(prev => {
        const ids = new Set(prev.map(j => j.id))
        const newJobs = initialJobs.filter(j => !ids.has(j.id))
        return newJobs.length > 0 ? [...newJobs, ...prev] : prev
      })
    }
  }, [initialJobs])

  const handleDelete = (jobId: string) => {
    // Optimistic delete
    setJobs((prev) => prev.filter((j) => j.id !== jobId))
    fetch(`/api/jobs/${jobId}`, { method: 'DELETE' }).catch(console.error)
  }

  const handleClipDelete = async (jobId: string, clipId: string) => {
    // Optimistic delete - remove clip from the job
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              clips: j.clips?.filter((c) => getClipStableId(c) !== clipId) ?? [],
              progress: {
                ...(j.progress ?? {}),
                completedClips: (j.progress?.completedClips ?? []).filter((c) => getClipStableId(c) !== clipId),
                deliveredClipCount: Math.max(0, (j.progress?.deliveredClipCount ?? j.clips?.length ?? 0) - 1),
              },
            }
          : j
      )
    )

    try {
      const res = await fetch(`/api/clips/${clipId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete clip')
      fetchJobs()
    } catch (error) {
      console.error(error)
      fetchJobs()
    }
  }

  const handleClipVote = async (jobId: string, clipId: string, value: 'up' | 'down' | 'neutral') => {
    const vote = { value, voted_at: new Date().toISOString() }
    setJobs((prev) => prev.map((job) => {
      if (job.id !== jobId) return job
      const updateClip = (clip: Clip) => getClipStableId(clip) === clipId ? { ...clip, vote } : clip
      return {
        ...job,
        clips: (job.clips ?? []).map(updateClip),
        progress: {
          ...(job.progress ?? {}),
          completedClips: (job.progress?.completedClips ?? []).map(updateClip),
        },
      }
    }))

    try {
      const res = await fetch(`/api/jobs/${jobId}/clips/${clipId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      })
      if (!res.ok) throw new Error('Failed to save clip vote')
      fetchJobs()
    } catch (error) {
      console.error(error)
      fetchJobs()
    }
  }

  const handleRescore = async (jobId: string) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'processing',
              progress: {
                ...(job.progress ?? {}),
                phase: 'scoring',
                inputKind: 'rescore',
                progress: 'Re-scoring cached transcript...',
                deliveredClipCount: 0,
                aiReturnedClipCount: 0,
                duplicateClipsRemoved: 0,
                clipShortfallReason: undefined,
              },
            }
          : job,
      ),
    )

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rescore' }),
      })

      if (!res.ok) {
        throw new Error('Failed to trigger rescore')
      }

      fetchJobs()
    } catch (error) {
      console.error(error)
      fetchJobs()
    }
  }

  const handleRetry = async (jobId: string) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: 'processing',
              progress: {
                ...(job.progress ?? {}),
                phase: 'queued',
                progress: 'Retrying job...',
                clipShortfallReason: undefined,
              },
            }
          : job,
      ),
    )

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      })

      if (!res.ok) {
        throw new Error('Failed to retry job')
      }

      fetchJobs()
    } catch (error) {
      console.error(error)
      fetchJobs()
    }
  }

  const handleJobComplete = async (updatedJob: Job) => {
    // Force status to complete and merge clips
    setJobs((prev) =>
      prev.map((j) => (j.id === updatedJob.id ? { ...updatedJob, status: 'complete' as const } : j))
    )
    // Re-fetch to ensure we have latest data with clips
    setTimeout(() => fetchJobs(), 500)
  }

  return (
    <div className="py-8 md:py-10 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-red-400 text-sm font-bold mb-2">CLIP GALLERY</p>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">Review, teach, and export the best cuts.</h1>
            <p className="text-white/50 leading-7">
              Finished jobs live here with clip previews, still-shot folders, scoring notes, download controls, and training feedback for Slicer.
            </p>
          </div>
          <div className="max-w-md rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/50">
            <strong className="text-white/75">Workflow:</strong> preview the clip, vote on quality, export the format, or open still shots for post-ready frames.
          </div>
        </div>
      </section>

      {jobs.length === 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
          <div className="relative flex min-h-[300px] w-full items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-black/20 px-8 py-14 md:min-h-[340px] md:px-14 md:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,77,77,0.14),transparent_64%)]" />
            <Image
              src="/slicer-watermark-white.png"
              alt="Slicer watermark"
              width={1024}
              height={1024}
              className="relative z-10 h-auto w-[340px] opacity-40 drop-shadow-[0_0_70px_rgba(255,77,77,0.18)] md:w-[520px]"
              priority
            />
          </div>
        </section>
      ) : (
        <section className="space-y-6">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onDelete={handleDelete}
              onRetry={handleRetry}
              onRescore={handleRescore}
              onJobComplete={handleJobComplete}
              onClipDelete={handleClipDelete}
              onClipVote={handleClipVote}
            />
          ))}
        </section>
      )}
    </div>
  )
}
