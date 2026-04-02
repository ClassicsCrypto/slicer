'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { ProcessingOptions, Job } from '@/types'
import { getApiUrl } from '@/lib/api-url'
import Button from '@/components/ui/Button'
import OptionsModal from '@/components/dashboard/OptionsModal'

const STEPS = [
  { key: 'submitting', label: 'Launching the mission...', icon: '🚀' },
  { key: 'transcribing', label: 'Mars Cats are listening...', icon: '🐱' },
  { key: 'scoring', label: 'Finding the best moments...', icon: '✂️' },
  { key: 'complete', label: 'Clips Ready!', icon: '✅' },
]

const MCV_MESSAGES = [
  "The Mars Cats are analyzing your content, Commander! 🐱🚀",
  "Slicer is chopping it up — sit tight! ✂️",
  "Our cats are listening for the best moments... 🎧",
  "Processing at light speed (almost)... 🌟",
  "The crew is on it — clips incoming! 🐱✨",
  "Mars Cats never miss a highlight! 🔥",
  "Scanning for viral moments... 🎯",
  "The cats have excellent taste in content 😼",
]

function getEstimatedTime(durationMin: number): string {
  // Rough estimate: download ~1min + transcription ~30s per 10min + scoring ~10s
  if (durationMin <= 2) return 'Less than 2 minutes'
  if (durationMin <= 10) return 'About 2-3 minutes'
  if (durationMin <= 30) return 'About 3-5 minutes'
  if (durationMin <= 60) return 'About 5-8 minutes'
  return 'About 10-15 minutes'
}

function InlineProcessing({ jobId, onComplete }: { jobId: string; onComplete: () => void }) {
  const [phase, setPhase] = useState('submitting')
  const [elapsed, setElapsed] = useState(0)
  const [showInterstitial, setShowInterstitial] = useState(false)
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
          setShowInterstitial(true)
          setTimeout(onComplete, 3500)
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

  if (showInterstitial) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 animate-fadeIn">
        <img src="/mcv-logo.jpg" alt="MCV" className="w-24 h-24 rounded-full mb-6 drop-shadow-[0_0_20px_rgba(255,77,77,0.4)]" />
        <h2 className="text-2xl font-black text-white mb-2">Thanks for using Slicer! 🐱✂️</h2>
        <p className="text-white/40 text-sm mb-1">by Mars Cats Voyage</p>
        <p className="text-white/20 text-xs mt-4">Loading your clips...</p>
        <div className="mt-3 w-6 h-6 border-2 border-white/20 border-t-red-500 rounded-full animate-spin" />
      </div>
    )
  }

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
      <p className="text-white/40 text-sm mb-2">
        {phase === 'complete' ? 'Redirecting to your clips...' :
         phase === 'failed' ? 'Something went wrong. Try again.' :
         MCV_MESSAGES[Math.floor(elapsed / 8) % MCV_MESSAGES.length]}
      </p>
      {phase !== 'complete' && phase !== 'failed' && (
        <p className="text-white/20 text-xs mb-4">{elapsed}s elapsed</p>
      )}

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
    style: 'bold',
    background: 'none',
    font: 'impact',
    outlineThickness: 'medium',
    outlineColor: '#000000',
    shadow: true,
    textCase: 'original',
  },
}

interface UploadTabProps {
  onJobCreated: (job: Job) => void
}

export default function UploadTab({ onJobCreated }: UploadTabProps) {
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS)
  const [showOptions, setShowOptions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [processingJobId, setProcessingJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [videoInfo, setVideoInfo] = useState<{ duration: number; durationMin: number; title: string; estimatedCredits: number; creditLimit: number } | null>(null)
  const [fetchingInfo, setFetchingInfo] = useState(false)

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      const f = files[0]
      // Max 2GB
      if (f.size > 2 * 1024 * 1024 * 1024) {
        setError('File too large — max 2GB')
        return
      }
      setFile(f)
      setUrl(`📁 ${f.name}`)
      setError(null)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': [] },
    multiple: false,
    noClick: true,
  })

  const handleOpenOptions = async () => {
    if (!url.trim() && !file) {
      setError('Please paste a video URL or drop a file')
      return
    }
    setError(null)
    setVideoInfo(null)

    // For YouTube/Twitch URLs, fetch video info to estimate credit usage
    const rawUrl = url.trim()
    if (!file && isYouTubeUrl(rawUrl)) {
      setFetchingInfo(true)
      try {
        const apiBase = await getApiUrl()
        const res = await fetch(`${apiBase}/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: rawUrl }),
        })
        if (res.ok) {
          const info = await res.json()
          setVideoInfo(info)
        }
      } catch {
        // info fetch failed, still allow proceeding
      } finally {
        setFetchingInfo(false)
      }
    } else if (file) {
      // For local files, estimate from file size (rough: 1MB ≈ 8sec at 720p)
      const estSec = (file.size / (1024 * 1024)) * 8
      setVideoInfo({
        duration: estSec,
        durationMin: parseFloat((estSec / 60).toFixed(1)),
        title: file.name,
        estimatedCredits: parseFloat((estSec / 60).toFixed(1)),
        creditLimit: 300,
      })
    }

    setShowOptions(true)
  }

  const isYouTubeUrl = (u: string) => /youtube\.com|youtu\.be|twitch\.tv|x\.com|twitter\.com/i.test(u)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      let sourceUrl = url.trim()
      let title = file ? file.name : extractTitle(sourceUrl)

      // Local file upload: upload to local server (bypasses Supabase RLS/size limits)
      if (file) {
        setUploadProgress('Uploading video...')
        try {
          const apiBase = await getApiUrl()
          const formData = new FormData()
          formData.append('file', file)

          const uploadRes = await fetch(`${apiBase}/upload`, {
            method: 'POST',
            body: formData,
          })

          if (!uploadRes.ok) {
            const errText = await uploadRes.text()
            setError(`Upload failed: ${errText}`)
            setIsSubmitting(false)
            setUploadProgress(null)
            return
          }

          const uploadData = await uploadRes.json()
          sourceUrl = uploadData.publicUrl
          title = file.name.replace(/\.[^.]+$/, '')
          setUploadProgress(null)
        } catch (uploadErr) {
          setError(`Upload error: ${uploadErr}`)
          setIsSubmitting(false)
          setUploadProgress(null)
          return
        }
      }

      // YouTube/Twitch: route through local yt-dlp API
      if (!file && isYouTubeUrl(sourceUrl)) {
        setError(null)
        setShowOptions(false) // Close modal immediately
        setUploadProgress('Downloading video...')
        try {
          const apiBase = await getApiUrl()
          // Start download (async — polls for completion)
          const startRes = await fetch(`${apiBase}/download-start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: sourceUrl }),
          })
          const startData = await startRes.json()
          if (!startRes.ok) {
            setError(startData.error || 'Download failed to start')
            setIsSubmitting(false)
            setUploadProgress(null)
            return
          }

          // If download was cached, skip polling
          if (startData.cached) {
            sourceUrl = startData.publicUrl
            title = startData.title || title
            setUploadProgress(null)
          } else {
            // Poll for completion
            const downloadId = startData.downloadId
            let done = false
            while (!done) {
              await new Promise(r => setTimeout(r, 3000))
              try {
                const pollRes = await fetch(`${apiBase}/download-poll/${downloadId}`)
                const pollData = await pollRes.json()
                if (pollData.status === 'complete') {
                  sourceUrl = pollData.publicUrl
                  title = pollData.title || title
                  done = true
                } else if (pollData.status === 'error') {
                  setError(pollData.error || 'Download failed')
                  setIsSubmitting(false)
                  setUploadProgress(null)
                  return
                } else {
                  setUploadProgress(`Downloading... ${pollData.progress || ''}`)
                }
              } catch {
                // Poll failed, retry
              }
            }
            setUploadProgress(null)
          }
        } catch {
          setError('Download server not available. Is the local API running?')
          setIsSubmitting(false)
          setUploadProgress(null)
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
      {/* Download/Upload progress banner */}
      {(uploadProgress || isSubmitting) && (
        <div className="mb-6 rounded-xl p-5 border border-yellow-500/20 bg-yellow-500/5 flex items-center gap-4">
          <div className="w-8 h-8 border-3 border-yellow-500/30 border-t-yellow-400 rounded-full animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-400">{uploadProgress || 'Processing...'}</p>
            <p className="text-xs text-white/30 mt-0.5">This may take a few minutes for long videos</p>
          </div>
        </div>
      )}
      {/* Features */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { icon: '📺', label: 'YouTube, Twitch & X', desc: 'Paste any video URL' },
          { icon: '📁', label: 'Local Files', desc: 'Upload MP4, MOV, WebM up to 2GB' },
          { icon: '🧠', label: 'AI Powered', desc: 'AI finds your best moments' },
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
            <h3 className="text-xl font-bold text-white mb-1">Drop a video, browse, or paste a URL</h3>
            <p className="text-white/40 text-sm">YouTube, Twitch, X/Twitter, direct URLs, or local video files</p>
          </div>

          <div className="w-full max-w-lg">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="YouTube, Twitch, X/Twitter URL or drop a file"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setFile(null); setError(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleOpenOptions()}
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 text-sm"
                readOnly={!!file}
              />
              <Button
                variant="primary"
                onClick={handleOpenOptions}
                disabled={!url.trim() && !file}
              >
                Analyze →
              </Button>
            </div>

            {/* Browse button */}
            <div className="flex items-center gap-3 mt-3">
              <label className="cursor-pointer px-4 py-2 rounded-lg border border-white/10 text-white/60 text-sm hover:border-white/30 hover:text-white transition-all">
                📂 Browse Files
                <input
                  type="file"
                  accept="video/*,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      if (f.size > 2 * 1024 * 1024 * 1024) {
                        setError('File too large — max 2GB')
                        return
                      }
                      setFile(f)
                      setUrl(`📁 ${f.name}`)
                      setError(null)
                    }
                  }}
                />
              </label>
              {file && (
                <button
                  onClick={() => { setFile(null); setUrl('') }}
                  className="text-white/30 hover:text-red-400 text-xs transition-colors"
                >
                  ✕ Clear
                </button>
              )}
              {uploadProgress && (
                <span className="text-xs text-yellow-400 animate-pulse">{uploadProgress}</span>
              )}
            </div>

            {error && (
              <p className="mt-2 text-red-400 text-sm">{error}</p>
            )}
          </div>

          <p className="text-white/20 text-xs">Drag & drop works too — just drop your video here</p>
        </div>
      </div>

      {/* Limits info */}
      <div className="mt-4 rounded-xl p-3 border border-white/5 flex items-center justify-between" style={{ background: '#15151F' }}>
        <div className="flex items-center gap-4 text-xs text-white/40">
          <span>📏 Max <strong className="text-white/60">2GB</strong> / <strong className="text-white/60">3 hours</strong></span>
          <span>📄 MP4, MOV, WebM, MKV</span>
          <span>🎙️ Transcription <strong className="text-green-400">Free · Unlimited</strong></span>
        </div>
      </div>

      <OptionsModal
        open={showOptions}
        onClose={() => setShowOptions(false)}
        options={options}
        onChange={setOptions}
        onConfirm={handleSubmit}
        isSubmitting={isSubmitting}
        videoInfo={videoInfo}
        fetchingInfo={fetchingInfo}
      />
    </div>
  )
}
