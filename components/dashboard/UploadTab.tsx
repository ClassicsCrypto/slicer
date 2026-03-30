'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { ProcessingOptions, Job } from '@/types'
import Button from '@/components/ui/Button'
import OptionsModal from '@/components/dashboard/OptionsModal'

const DEFAULT_OPTIONS: ProcessingOptions = {
  clipCount: 5,
  clipLength: '30',
  aiFocus: ['funny_moments', 'hype_moments', 'intense_action'],
  outputQuality: '720p',
  platformFormat: 'twitter',
}

interface UploadTabProps {
  onJobCreated: (job: Job) => void
}

export default function UploadTab({ onJobCreated }: UploadTabProps) {
  const [url, setUrl] = useState('')
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS)
  const [showOptions, setShowOptions] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
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

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceUrl: url.trim(),
          title: extractTitle(url.trim()),
          options,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to start processing')
        setIsSubmitting(false)
        return
      }

      // Fetch the created job
      const jobsRes = await fetch('/api/jobs')
      const { jobs } = await jobsRes.json()
      const newJob = jobs?.find((j: Job) => j.id === data.jobId)

      if (newJob) {
        setShowOptions(false)
        onJobCreated(newJob)
      } else {
        setError('Job created but could not fetch it')
      }
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
