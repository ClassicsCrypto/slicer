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
  const [progressPct, setProgressPct] = useState(0)
  const completed = useRef(false)
  const phaseStartTime = useRef(Date.now())
  const pendingComplete = useRef(false)

  // Smooth progress animation
  useEffect(() => {
    if (phase === 'submitting') {
      // Animate from 0 to 30% over 2 seconds
      const start = Date.now()
      const tick = () => {
        const elapsed = Date.now() - start
        const pct = Math.min(30, (elapsed / 2000) * 30)
        setProgressPct(pct)
        if (elapsed < 2000 && phase === 'submitting') requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } else if (phase === 'rendering') {
      // Animate from 30% toward 90%, with real clip progress mixed in
      const basePct = 30
      const targetPct = totalClips > 0 ? basePct + (clipsReady / totalClips) * 60 : basePct + 20
      setProgressPct(Math.min(90, targetPct))
    } else if (phase === 'complete') {
      setProgressPct(100)
    }
  }, [phase, clipsReady, totalClips])

  // Enforce minimum phase durations before transitioning
  const tryTransition = (nextPhase: 'rendering' | 'complete', minMs: number) => {
    const elapsed = Date.now() - phaseStartTime.current
    if (elapsed >= minMs) {
      phaseStartTime.current = Date.now()
      setPhase(nextPhase)
      return true
    }
    // Schedule delayed transition
    setTimeout(() => {
      phaseStartTime.current = Date.now()
      setPhase(nextPhase)
    }, minMs - elapsed)
    return false
  }

  useEffect(() => {
    if (completed.current) return
    if (!jobId || jobId.startsWith('dev-') || jobId.startsWith('pending-')) return

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

        setTotalClips(renderIds.length || clips.length)
        setClipsReady(clips.length)

        if (progress.estimatedSecondsRemaining != null) {
          setEta(progress.estimatedSecondsRemaining)
        }

        if (data.status === 'complete') {
          if (!completed.current) {
            completed.current = true
            setClipsReady(clips.length || renderIds.length)
            setTotalClips(renderIds.length || clips.length)

            // Ensure we show rendering phase for at least 1.5s before complete
            if (phase === 'submitting') {
              tryTransition('rendering', 1500)
              setTimeout(() => {
                setPhase('complete')
                setTimeout(onComplete, 1800)
              }, 3000)
            } else {
              tryTransition('complete', 1500)
              setTimeout(onComplete, 1800)
            }
          }
        } else if (data.status === 'failed') {
          setPhase('failed')
        } else if (renderIds.length > 0 && phase === 'submitting') {
          tryTransition('rendering', 1500)
        }
      } catch (err) {
        console.error('[ProcessingView] poll error:', err)
      }
    }

    // Poll immediately, then every 5 seconds
    const timer = setTimeout(pollJob, 800) // slight delay so user sees submitting phase
    const interval = setInterval(pollJob, 5000)
    return () => { clearTimeout(timer); clearInterval(interval) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, onComplete, phase])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4">
      {/* Cat animation */}
      <div className="mb-8 relative flex items-center justify-center">
        <div className={`absolute inset-0 rounded-full blur-3xl scale-125 ${
          phase === 'complete' ? 'bg-green-500/30' : 'bg-primary/20 animate-pulse'
        }`} />
        <video
          src="/slicer-cat.mp4"
          autoPlay loop muted playsInline
          width={200} height={200}
          className="relative rounded-2xl drop-shadow-[0_0_32px_rgba(0,191,165,0.8)]"
        />
      </div>

      {/* Status heading */}
      <h2 className="text-2xl font-bold mb-1 text-white transition-all duration-500">
        {phase === 'complete' ? '✅ Clips Ready!' :
         phase === 'failed' ? '❌ Processing Failed' :
         phase === 'rendering' ? '🎬 Creating Clips...' :
         '🧠 AI Analyzing Video...'}
      </h2>
      <p className="text-muted text-sm mb-8 transition-all duration-500">
        {phase === 'complete' ? 'Redirecting to your clips...' :
         phase === 'failed' ? 'Something went wrong. Try again.' :
         phase === 'rendering'
           ? totalClips > 0 ? `${clipsReady} of ${totalClips} clips rendered` : 'Building your clips...'
           : 'Finding the best moments in your video'}
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-sm mb-8">
        <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${
              phase === 'complete'
                ? 'bg-green-500'
                : 'bg-gradient-to-r from-primary to-accent'
            }`}
            style={{ width: `${Math.max(5, progressPct)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-xs text-muted">
            {phase === 'complete' ? 'Done!' :
             phase === 'rendering' && totalClips > 0 ? `${clipsReady}/${totalClips} clips` :
             'Processing...'}
          </span>
          {eta != null && eta > 0 && phase === 'rendering' && (
            <span className="text-xs text-muted">
              ~{eta >= 60 ? `${Math.ceil(eta / 60)}m` : `${eta}s`}
            </span>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="w-full max-w-sm space-y-4 mb-8">
        {[
          { label: 'AI analyzing video', done: phase === 'rendering' || phase === 'complete', active: phase === 'submitting' },
          { label: 'Creating clips', done: phase === 'complete', active: phase === 'rendering',
            detail: phase === 'rendering' && totalClips > 0 ? `${clipsReady}/${totalClips}` : undefined },
          { label: 'Clips ready', done: phase === 'complete' },
        ].map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 transition-all duration-500 ${
              !step.done && !step.active ? 'opacity-30' : 'opacity-100'
            }`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
              step.done ? 'bg-primary text-background scale-100' :
              step.active ? 'border-2 border-primary scale-110' :
              'border-2 border-white/20 scale-100'
            }`}>
              {step.done && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {step.active && <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />}
            </div>
            <div className="flex-1">
              <span className={`text-sm font-medium transition-colors duration-500 ${
                step.done ? 'text-primary' : step.active ? 'text-white' : 'text-muted'
              }`}>
                {step.label}
              </span>
              {step.detail && (
                <span className="text-xs text-muted ml-2">({step.detail})</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {phase !== 'complete' && phase !== 'failed' && (
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      )}
      {phase === 'failed' && (
        <Button variant="primary" size="sm" onClick={onCancel}>Try Again</Button>
      )}
    </div>
  )
}
