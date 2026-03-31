'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { ProcessingOptions, Job } from '@/types'
import Button from '@/components/ui/Button'
import OptionsModal from '@/components/dashboard/OptionsModal'

const STEPS = [
  { key: 'submitting', label: 'Submitting Video', icon: '📤' },
  { key: 'transcribing', label: 'AI Transcribing Audio', icon: '🎙️' },
  { key: 'scoring', label: 'AI Selecting Best Moments', icon: '🧠' },
  { key: 'complete', label: 'Clips Ready!', icon: '✅' },
]

function InlineProcessing({ jobId, onComplete }: { jobId: string; onComplete: () => void }) {
  const [phase, setPhase] = useState('submitting')
  const [elapsed, setElapsed] = useState(0)
  const completedRef = useRef(false)
  const startTime = useRef(Date.now())

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Poll
  useEffect(() => {
    if (completedRef.current) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/poll`)
        if (!res.ok) return
        const data = await res.json()
        
        if (data.phase) setPhase(data.phase)
        if (data.status === 'complete' && !completedRef.current) {
          completedRef.current = true
          setPhase('complete')
          setTimeout(onComplete, 2000)
        }
        if (data.status === 'failed') {
          setPhase('failed')
        }
      } catch {}
    }

    // First poll after 2s (give process route time to submit to AssemblyAI)
    const initial = setTimeout(poll, 2000)
    const interval = setInterval(poll, 5000)
    return () => { clearTimeout(initial); clearInterval(interval) }
  }, [jobId, onComplete])

  const stepIndex = STEPS.findIndex(s => s.key === phase)
  const progress = phase === 'complete' ? 100 : phase === 'failed' ? 0 : Math.min(90, (stepIndex / STEPS.length) * 100 + elapsed * 0.5)

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Animated ring */}
      <div className="relative mb-8">
        <div className={`w-24 h-24 rounded-full border-4 ${phase === 'complete' ? 'border-green-500' : 'border-white/10'}`}>
          <div className={`w-full h-full rounded-full flex items-center justify-center text-4xl ${phase === 'complete' ? '' : 'animate-pulse'}`}>
            {STEPS[Math.max(0, stepIndex)]?.icon ?? '⏳'}
          </div>
        </div>
        {phase !== 'complete' && phase !== 'failed' && (
          <div className="absolute inset-0 rounded-full border-4 border-t-red-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
        )}
      </div>

      {/* Status */}
      <h2 className="text-xl font-bold text-white mb-2">
        {phase === 'failed' ? '❌ Processing Failed' : STEPS[Math.max(0, stepIndex)]?.label ?? 'Processing...'}
      </h2>
      <p className="text-white/40 text-sm mb-6">
        {phase === 'complete' ? 'Redirecting to your clips...' :
         phase === 'failed' ? 'Something went wrong. Try again.' :
         `${elapsed}s elapsed`}
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-sm mb-8">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: phase === 'complete' ? '#22c55e' : 'linear-gradient(90deg, #FF4D4D, #FF6B6B)',
            }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="w-full max-w-xs space-y-3">
        {STEPS.map((step, i) => {
          const isDone = i < stepIndex || phase === 'complete'
          const isActive = i === stepIndex && phase !== 'complete' && phase !== 'failed'
          return (
            <div key={step.key} className={`flex items-center gap-3 transition-all duration-300 ${isDone || isActive ? 'opacity-100' : 'opacity-30'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 transition-all ${
                isDone ? 'bg-green-500 text-white' : isActive ? 'border-2 border-red-500' : 'border border-white/20'
              }`}>
                {isDone ? '✓' : isActive ? <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> : ''}
              </div>
              <span className={`text-sm ${isDone ? 'text-green-400' : isActive ? 'text-white font-semibold' : 'text-white/40'}`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  clipCount: 5,
  clipLength: '30',
  aiFocus: ['funny_moments', 'hype_moments', 'intense_action'],
  outputQuality: '720p',
  platformFormat: 'twitter',
  subtitles: {
    enabled: true,
    size: 'medium',
    color: '#ffffff',
    position: 'bottom',
    style: 'karaoke',
    background: 'blur',
  },
}

interface UploadTabProps {
  onJobCreated: (job: Job) => void
}

export default function UploadTab({ onJobCreated }: UploadTabProps) {
  const [url, setUrl] = useState('')
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS)
  const [showOptions, setShowOptions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processingJobId, setProcessingJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback((files: File[]) => {
    // For now just show the filename — actual upload not implemented yet
    if (files[0]) {
      setUrl(`[File: ${files[0].name}]`)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    multiple: false,
    noClick: true,
  })

  const handleOpenOptions = () => {
    if (!url.trim()) {
      setError('Please paste a video URL first')
      return
    }
    setError(null)
    setShowOptions(true)
  }

  const isYouTubeUrl = (u: string) => /youtube\.com|youtu\.be|twitch\.tv/i.test(u)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      let sourceUrl = url.trim()
      let title = extractTitle(sourceUrl)

      // YouTube/Twitch: route through local yt-dlp API
      if (isYouTubeUrl(sourceUrl)) {
        setError(null)
        try {
          const ytRes = await fetch('http://localhost:3001/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: sourceUrl }),
          })
          const ytData = await ytRes.json()
          if (!ytRes.ok) {
            setError(ytData.error || 'YouTube download failed')
            setIsSubmitting(false)
            return
          }
          sourceUrl = ytData.publicUrl
          title = ytData.title || title
        } catch {
          setError('YouTube download server not available. Is the local API running? (node server/youtube-api.js)')
          setIsSubmitting(false)
          return
        }
      }

      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl,
          title,
          options,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to start processing')
        setIsSubmitting(false)
        return
      }

      // Show processing screen and start polling
      setShowOptions(false)
      setProcessingJobId(data.jobId)
    } catch (err) {
      setError(`Network error: ${err}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  function extractTitle(srcUrl: string): string {
    try {
      return new URL(srcUrl).hostname
    } catch {
      return 'Untitled'
    }
  }

  // Show processing view while job is running
  if (processingJobId) {
    return (
      <InlineProcessing
        jobId={processingJobId}
        onComplete={() => {
          setProcessingJobId(null)
          setUrl('')
          setIsSubmitting(false)
          // Build minimal job and switch to clips
          const completedJob: Job = {
            id: processingJobId,
            user_id: '',
            title: extractTitle(url.trim() || 'Video'),
            source_url: url.trim(),
            status: 'complete',
            options,
            progress: { phase: 'complete' },
            clips: [],
            created_at: new Date().toISOString(),
          }
          onJobCreated(completedJob)
        }}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      {/* Drop zone + URL input */}
      <div
        {...getRootProps()}
        className={`rounded-2xl border-2 border-dashed p-10 text-center transition-all ${
          isDragActive ? 'drag-active' : 'border-white/10 hover:border-white/20'
        }`}
        style={{ background: '#15151F' }}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-4">
          <div className="text-5xl animate-float">🎬</div>

          <div>
            <h3 className="text-xl font-bold text-white mb-1">Drop a video or paste a URL</h3>
            <p className="text-white/40 text-sm">Supports direct video URLs (MP4, etc.)</p>
          </div>

          <div className="w-full max-w-lg">
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/video.mp4"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleOpenOptions()}
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm"
              />
              <Button
                variant="primary"
                onClick={handleOpenOptions}
                disabled={!url.trim()}
              >
                Analyze →
              </Button>
            </div>

            {error && (
              <p className="mt-2 text-red-400 text-sm">{error}</p>
            )}
          </div>

          <p className="text-white/20 text-xs">or drag & drop a video file</p>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { icon: '🔗', label: 'Direct URLs', desc: 'Paste any publicly accessible video URL' },
          { icon: '🎮', label: 'Gaming Content', desc: 'Optimized for kills, highlights, fails' },
          { icon: '⚡', label: 'Instant Mode', desc: 'Clips ready in seconds, no rendering wait' },
        ].map((tip) => (
          <div
            key={tip.label}
            className="rounded-xl p-4 border border-white/5 text-center"
            style={{ background: '#15151F' }}
          >
            <div className="text-2xl mb-2">{tip.icon}</div>
            <div className="text-xs font-semibold text-white mb-1">{tip.label}</div>
            <div className="text-xs text-white/30">{tip.desc}</div>
          </div>
        ))}
      </div>

      <OptionsModal
        open={showOptions}
        onClose={() => setShowOptions(false)}
        options={options}
        onChange={setOptions}
        onConfirm={handleSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  )
}
