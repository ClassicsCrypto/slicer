'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Job, Clip, SubtitleWord, SubtitleOptions, SubtitleOutlineThickness, SubtitleOutlineColor, SubtitleCase, SubtitleSize, SubtitleFont, SubtitleColor } from '@/types'
import { getApiUrl } from '@/lib/api-url'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ClipPlayer from '@/components/dashboard/ClipPlayer'
import ProcessingView from '@/components/dashboard/ProcessingView'

interface ClipsGalleryProps {
  initialJobs?: Job[]
}

function DownloadClipButton({ clip, sourceUrl, title, subtitleOptions }: { clip: Clip; sourceUrl: string; title: string; subtitleOptions?: import('@/types').SubtitleOptions }) {
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState('')

  const handleDownload = async () => {
    setDownloading(true)
    setProgress('Cutting clip...')
    
    console.log('[Slicer] Export clip subtitles:', clip.subtitles?.length || 0, 'words')
    console.log('[Slicer] First 3 words:', JSON.stringify(clip.subtitles?.slice(0, 3)))
    console.log('[Slicer] Subtitle options sent:', JSON.stringify(subtitleOptions))

    try {
      const apiBase = await getApiUrl()
      const res = await fetch(`${apiBase}/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: sourceUrl,
          startTime: clip.start_time,
          endTime: clip.end_time,
          title: `${title}-clip-${clip.start_time.toFixed(0)}s`,
          subtitles: clip.subtitles || [],
          subtitleOptions: subtitleOptions || {
            enabled: true, size: 'medium', color: '#ffffff', position: 'bottom',
            style: 'bold', background: 'none', font: 'impact',
            outlineThickness: 'medium', outlineColor: '#000000', shadow: true, textCase: 'upper',
          },
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

      setProgress('✅ Done!')
      setTimeout(() => { setDownloading(false); setProgress('') }, 2000)
    } catch {
      setProgress('Server not available')
      setTimeout(() => { setDownloading(false); setProgress('') }, 3000)
    }
  }

  return (
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
        '⬇️ Export Clip'
      )}
    </button>
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

function ClipCard({
  clip,
  sourceUrl,
  onPreview,
}: {
  clip: Clip
  sourceUrl: string
  onPreview: (clip: Clip) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    // Client-side thumbnail: seek video to mid-clip and capture frame
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.preload = 'metadata'
    video.muted = true
    const midTime = clip.start_time + (clip.duration / 2)

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = midTime
    })
    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 180
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          setThumbUrl(canvas.toDataURL('image/jpeg', 0.7))
        }
      } catch { /* CORS or other error — fall back to video element */ }
      video.src = '' // cleanup
    })
    video.src = sourceUrl
    return () => { video.src = '' }
  }, [sourceUrl, clip.start_time, clip.duration])

  return (
    <div
      className="rounded-xl border border-white/10 overflow-hidden hover:border-white/20 transition-all cursor-pointer group"
      style={{ background: '#15151F' }}
      onClick={() => onPreview(clip)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black/50 flex items-center justify-center">
        {thumbUrl ? (
          <img src={thumbUrl} alt="Clip thumbnail" className="w-full h-full object-cover" />
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
          {Math.round(clip.duration)}s
        </div>
        {/* Virality score */}
        {clip.virality_score !== undefined && (
          <div className="absolute top-2 right-2">
            <Badge variant="red">🔥 {clip.virality_score}/10</Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-xs text-white/40 mb-2 line-clamp-2">{clip.ai_reason}</p>
        <div className="flex flex-wrap gap-1">
          {clip.matched_categories.slice(0, 3).map((cat) => (
            <Badge key={cat} variant="dark">{formatCategory(cat)}</Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

function JobCard({
  job,
  onDelete,
  onJobComplete,
}: {
  job: Job
  onDelete: (id: string) => void
  onJobComplete: (job: Job) => void
}) {
  const [previewClip, setPreviewClip] = useState<Clip | null>(null)
  const [editedTranscript, setEditedTranscript] = useState<string>('')
  const [showTranscript, setShowTranscript] = useState(false)
  const [aiCaption, setAiCaption] = useState<string>('')
  const [captionLoading, setCaptionLoading] = useState(false)
  const [copiedCaption, setCopiedCaption] = useState<string | null>(null)
  const [liveSubOpts, setLiveSubOpts] = useState(job.options?.subtitles || {
    enabled: true, size: 'medium' as const, color: '#ffffff' as const, position: 'bottom' as const,
    style: 'bold' as const, background: 'none' as const, font: 'impact' as const,
    outlineThickness: 'medium' as const, outlineColor: '#000000' as const, shadow: true, textCase: 'original' as const,
  })

  const isProcessing = job.status === 'processing'
  const clips = job.clips ?? []

  return (
    <div
      className="rounded-2xl border border-white/10 overflow-hidden mb-6"
      style={{ background: '#15151F' }}
    >
      {/* Job header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">{job.title}</h3>
          <p className="text-xs text-white/30 mt-0.5">{timeAgo(job.created_at)}</p>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {job.status === 'complete' && (
            <Badge variant="green">✅ {clips.length} clips</Badge>
          )}
          {job.status === 'processing' && (
            <Badge variant="dark">⏳ Processing</Badge>
          )}
          {job.status === 'failed' && (
            <Badge variant="red">❌ Failed</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDelete(job.id) }}
            className="text-white/30 hover:text-red-400"
          >
            🗑
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {isProcessing ? (
          <ProcessingView job={job} onComplete={onJobComplete} />
        ) : clips.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                sourceUrl={job.source_url}
                onPreview={setPreviewClip}
              />
            ))}
          </div>
        ) : (
          <p className="text-white/30 text-sm text-center py-6">No clips generated.</p>
        )}
      </div>

      {/* Preview modal */}
      {previewClip && (
        <Modal
          open={!!previewClip}
          onClose={() => setPreviewClip(null)}
          title={`Clip • ${Math.round(previewClip.duration)}s`}
          maxWidth="max-w-2xl"
        >
          <ClipPlayer clip={previewClip} sourceUrl={job.source_url} subtitleOptions={liveSubOpts} />

          {/* Inline subtitle settings */}
          <div className="mt-3 p-3 bg-white/5 rounded-lg border border-white/10 space-y-2">
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wider">Subtitle Style</p>
            <div className="grid grid-cols-2 gap-2">
              {/* Font */}
              <div>
                <label className="text-[10px] text-white/30">Font</label>
                <div className="flex gap-1 mt-0.5">
                  {([{ v: 'impact' as SubtitleFont, l: 'Impact' }, { v: 'bebas' as SubtitleFont, l: 'Bebas' }, { v: 'montserrat' as SubtitleFont, l: 'Mont' }]).map(f => (
                    <button key={f.v} onClick={() => setLiveSubOpts({ ...liveSubOpts, font: f.v })}
                      className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${(liveSubOpts.font || 'impact') === f.v ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/40 border border-white/10'}`}
                    >{f.l}</button>
                  ))}
                </div>
              </div>
              {/* Size */}
              <div>
                <label className="text-[10px] text-white/30">Size</label>
                <div className="flex gap-1 mt-0.5">
                  {(['small', 'medium', 'large'] as SubtitleSize[]).map(v => (
                    <button key={v} onClick={() => setLiveSubOpts({ ...liveSubOpts, size: v })}
                      className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${(liveSubOpts.size || 'medium') === v ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/40 border border-white/10'}`}
                    >{v[0].toUpperCase()}</button>
                  ))}
                </div>
              </div>
              {/* Text Color */}
              <div>
                <label className="text-[10px] text-white/30">Text Color</label>
                <div className="flex gap-1 mt-0.5">
                  {([{ v: '#ffffff' as SubtitleColor, l: '⬜' }, { v: '#ffff00' as SubtitleColor, l: '🟨' }, { v: '#FF4D4D' as SubtitleColor, l: '🟥' }]).map(c => (
                    <button key={c.v} onClick={() => setLiveSubOpts({ ...liveSubOpts, color: c.v })}
                      className={`flex-1 py-1 rounded text-xs transition-all ${(liveSubOpts.color || '#ffffff') === c.v ? 'bg-red-500/20 border border-red-500/30' : 'bg-white/5 border border-white/10'}`}
                    >{c.l}</button>
                  ))}
                </div>
              </div>
              {/* Outline Thickness */}
              <div>
                <label className="text-[10px] text-white/30">Outline</label>
                <div className="flex gap-1 mt-0.5">
                  {(['none', 'thin', 'medium', 'thick'] as Array<SubtitleOutlineThickness | 'none'>).map(v => (
                    <button key={v} onClick={() => setLiveSubOpts({ ...liveSubOpts, outlineThickness: v as SubtitleOutlineThickness })}
                      className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${(liveSubOpts.outlineThickness || 'medium') === v ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/40 border border-white/10'}`}
                    >{v === 'none' ? 'Off' : v}</button>
                  ))}
                </div>
              </div>
              {/* Outline Color */}
              <div>
                <label className="text-[10px] text-white/30">Outline Color</label>
                <div className="flex gap-1 mt-0.5">
                  {([{ v: '#000000', l: '⬛' }, { v: '#ffffff', l: '⬜' }, { v: '#FF4D4D', l: '🟥' }] as { v: SubtitleOutlineColor; l: string }[]).map(c => (
                    <button key={c.v} onClick={() => setLiveSubOpts({ ...liveSubOpts, outlineColor: c.v })}
                      className={`flex-1 py-1 rounded text-xs transition-all ${(liveSubOpts.outlineColor || '#000000') === c.v ? 'bg-red-500/20 border border-red-500/30' : 'bg-white/5 border border-white/10'}`}
                    >{c.l}</button>
                  ))}
                </div>
              </div>
              {/* Letter Case */}
              <div>
                <label className="text-[10px] text-white/30">Case</label>
                <div className="flex gap-1 mt-0.5">
                  {(['upper', 'title', 'original'] as SubtitleCase[]).map(v => (
                    <button key={v} onClick={() => setLiveSubOpts({ ...liveSubOpts, textCase: v })}
                      className={`flex-1 py-1 rounded text-[10px] font-semibold transition-all ${(liveSubOpts.textCase || 'upper') === v ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/40 border border-white/10'}`}
                    >{v === 'upper' ? 'ABC' : v === 'title' ? 'Abc' : 'abc'}</button>
                  ))}
                </div>
              </div>
              {/* Shadow Toggle */}
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-[10px] text-white/30">Shadow</label>
                  <button onClick={() => setLiveSubOpts({ ...liveSubOpts, shadow: !liveSubOpts.shadow })}
                    className={`block mt-0.5 px-3 py-1 rounded text-[10px] font-semibold transition-all ${liveSubOpts.shadow ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-white/40 border border-white/10'}`}
                  >{liveSubOpts.shadow ? 'ON' : 'OFF'}</button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-sm text-white/60">{previewClip.ai_reason}</p>
            <div className="flex flex-wrap gap-1">
              {previewClip.matched_categories.map((cat) => (
                <Badge key={cat} variant="teal">{formatCategory(cat)}</Badge>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs text-white/30 pt-1">
              <span>Start: {previewClip.start_time.toFixed(1)}s</span>
              <span>End: {previewClip.end_time.toFixed(1)}s</span>
              {previewClip.virality_score !== undefined && (
                <span>🔥 Virality: {previewClip.virality_score}/10</span>
              )}
            </div>
            {/* Transcript editor */}
            <div className="pt-2">
              <button
                onClick={() => {
                  if (!showTranscript && previewClip.subtitles) {
                    setEditedTranscript(previewClip.subtitles.map(w => w.text).join(' '))
                  }
                  setShowTranscript(!showTranscript)
                }}
                className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1"
              >
                {showTranscript ? '▼' : '▶'} Edit Transcript
              </button>
              {showTranscript && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={editedTranscript}
                    onChange={(e) => setEditedTranscript(e.target.value)}
                    className="w-full h-24 bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white/80 resize-none focus:border-red-500 focus:outline-none"
                    placeholder="Edit the transcribed text..."
                  />
                  <button
                    onClick={() => {
                      if (!previewClip.subtitles?.length) return
                      // Rebuild subtitle words with edited text, keeping original timing
                      const newWords = editedTranscript.trim().split(/\s+/)
                      const origWords = previewClip.subtitles
                      const updated: SubtitleWord[] = newWords.map((text, i) => {
                        const orig = origWords[Math.min(i, origWords.length - 1)]
                        return {
                          text,
                          start: i < origWords.length ? origWords[i].start : orig.start,
                          end: i < origWords.length ? origWords[i].end : orig.end,
                        }
                      })
                      setPreviewClip({ ...previewClip, subtitles: updated })
                      setShowTranscript(false)
                    }}
                    className="px-3 py-1.5 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400 font-semibold hover:bg-red-500/30 transition-all"
                  >
                    ✓ Apply Changes
                  </button>
                </div>
              )}
            </div>

            {/* Download buttons */}
            <div className="pt-3 flex gap-2">
              <DownloadClipButton clip={previewClip} sourceUrl={job.source_url} title={job.title} subtitleOptions={liveSubOpts} />
              <a
                href={job.source_url}
                download={`slicer-full-${job.title}.mp4`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm text-white/60 border border-white/10 hover:border-white/30 transition-all"
              >
                📥 Full Video
              </a>
            </div>

            {/* Social Export */}
            <div className="pt-3 border-t border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/40 font-semibold uppercase tracking-wider">📱 Social Caption</span>
                <button
                  onClick={async () => {
                    setCaptionLoading(true)
                    try {
                      const transcript = previewClip.subtitles?.map(w => w.text).join(' ') || previewClip.ai_reason
                      const res = await fetch('/api/caption', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          transcript,
                          categories: previewClip.matched_categories,
                          title: job.title,
                          duration: previewClip.duration,
                        }),
                      })
                      if (res.ok) {
                        const data = await res.json()
                        setAiCaption(data.caption)
                      }
                    } catch {} finally { setCaptionLoading(false) }
                  }}
                  disabled={captionLoading}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {captionLoading ? '⏳ Generating...' : '✨ Generate Caption'}
                </button>
              </div>
              {aiCaption && (
                <div className="space-y-2">
                  <textarea
                    value={aiCaption}
                    onChange={(e) => setAiCaption(e.target.value)}
                    className="w-full h-20 bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white/80 resize-none focus:border-red-500 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    {[
                      { label: '🐦 Twitter', key: 'twitter' },
                      { label: '📱 TikTok', key: 'tiktok' },
                      { label: '📸 Instagram', key: 'instagram' },
                    ].map(p => (
                      <button
                        key={p.key}
                        onClick={() => {
                          navigator.clipboard.writeText(aiCaption)
                          setCopiedCaption(p.key)
                          setTimeout(() => setCopiedCaption(null), 2000)
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          copiedCaption === p.key
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-white/5 text-white/50 border border-white/10 hover:border-white/30'
                        }`}
                      >
                        {copiedCaption === p.key ? '✓ Copied!' : p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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
    fetchJobs()
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

  const handleJobComplete = async (updatedJob: Job) => {
    // Force status to complete and merge clips
    setJobs((prev) =>
      prev.map((j) => (j.id === updatedJob.id ? { ...updatedJob, status: 'complete' as const } : j))
    )
    // Re-fetch to ensure we have latest data with clips
    setTimeout(() => fetchJobs(), 500)
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="text-5xl">🎬</div>
        <h3 className="text-xl font-bold text-white">No clips yet</h3>
        <p className="text-white/40 text-sm">Upload a video to get started</p>
      </div>
    )
  }

  return (
    <div className="py-6">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onDelete={handleDelete}
          onJobComplete={handleJobComplete}
        />
      ))}
    </div>
  )
}
