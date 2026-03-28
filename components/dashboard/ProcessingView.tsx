'use client'

import React, { useEffect, useState, useRef } from 'react'
import Button from '@/components/ui/Button'

interface ProcessingViewProps {
  jobId: string
  onCancel: () => void
  onComplete: () => void
}

export default function ProcessingView({ jobId, onCancel, onComplete }: ProcessingViewProps) {
  const [phase, setPhase] = useState<'submitting' | 'rendering' | 'complete' | 'failed'>('submitting')
  const [clipsReady, setClipsReady] = useState(0)
  const [totalClips, setTotalClips] = useState(0)
  const [eta, setEta] = useState<number | null>(null)
  const completed = useRef(false)

  useEffect(() => {
    if (completed.current) return

    // Don't poll temp job IDs — wait for real one
    if (jobId.startsWith('dev-') || jobId.startsWith('pending-')) return

    const pollJob = async () => {
      if (completed.current) return
      try {
        const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
        const pollUrl = devUserId
          ? `/api/jobs/${jobId}/poll?userId=${devUserId}`
          : `/api/jobs/${jobId}/poll`
        const res = await fetch(pollUrl)
        if (!res.ok) return

        const data = await res.json()
        const progress = data.progress || {}
        const renderIds = progress.renderIds || []
        const clips = progress.completedClips || []

        setTotalClips(renderIds.length)
        setClipsReady(clips.length)

        if (renderIds.length > 0) {
          setPhase('rendering')
        }

        if (progress.estimatedSecondsRemaining != null) {
          setEta(progress.estimatedSecondsRemaining)
        }

        if (data.status === 'complete') {
          if (!completed.current) {
            completed.current = true
            setPhase('complete')
            setClipsReady(clips.length || renderIds.length)
            setTimeout(onComplete, 2000)
          }
        } else if (data.status === 'failed') {
          setPhase('failed')
        }
      } catch (err) {
        console.error('[ProcessingView] poll error:', err)
      }
    }

    // Poll immediately, then every 6 seconds
    pollJob()
    const interval = setInterval(pollJob, 6000)
    return () => clearInterval(interval)
  }, [jobId, onComplete])

  const pct = totalClips > 0 ? Math.round((clipsReady / totalClips) * 100) : 0

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4">
      {/* Cat animation */}
      <div className="mb-8 relative flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl scale-125 animate-pulse" />
        <video
          src="/slicer-cat.mp4"
          autoPlay loop muted playsInline
          width={200} height={200}
          className="relative rounded-2xl drop-shadow-[0_0_32px_rgba(0,191,165,0.8)]"
        />
      </div>

      {/* Status heading */}
      <h2 className="text-2xl font-bold mb-1 text-white">
        {phase === 'complete' ? '✅ Clips Ready!' :
         phase === 'failed' ? '❌ Processing Failed' :
         phase === 'rendering' ? '🎬 Rendering Clips...' :
         '⚡ Submitting to Shotstack...'}
      </h2>
      <p className="text-muted text-sm mb-8">
        {phase === 'complete' ? 'Redirecting to your clips...' :
         phase === 'failed' ? 'Something went wrong. Try again.' :
         phase === 'rendering'
           ? `${clipsReady} of ${totalClips} clips done`
           : 'Setting up your video for processing'}
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-sm mb-8">
        <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
          {phase === 'complete' ? (
            <div className="h-full w-full bg-gradient-to-r from-primary to-accent rounded-full" />
          ) : phase === 'rendering' && pct > 0 ? (
            <div
              className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          ) : (
            <div
              className="h-full w-1/3 bg-gradient-to-r from-primary to-accent rounded-full"
              style={{ animation: 'shimmer 1.5s ease-in-out infinite' }}
            />
          )}
        </div>
        {eta != null && eta > 0 && phase === 'rendering' && (
          <p className="text-xs text-muted mt-2 text-center">
            ~{eta >= 60 ? `${Math.ceil(eta / 60)} min` : `${eta}s`} remaining
          </p>
        )}
      </div>

      {/* Step indicators */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        {[
          { label: 'Video submitted', done: phase !== 'submitting' },
          { label: 'Rendering clips', done: phase === 'complete', active: phase === 'rendering' },
          { label: 'Clips ready', done: phase === 'complete' },
        ].map((step, i) => (
          <div key={i} className={`flex items-center gap-3 ${!step.done && !step.active ? 'opacity-40' : 'opacity-100'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              step.done ? 'bg-primary text-background' :
              step.active ? 'border-2 border-primary' :
              'border-2 border-white/20'
            }`}>
              {step.done && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {step.active && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
            </div>
            <span className={`text-sm ${step.done ? 'text-primary' : step.active ? 'text-white font-semibold' : 'text-muted'}`}>
              {step.label}
              {step.active && totalClips > 0 ? ` (${clipsReady}/${totalClips})` : ''}
            </span>
          </div>
        ))}
      </div>

      {phase !== 'complete' && (
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      )}
    </div>
  )
}
