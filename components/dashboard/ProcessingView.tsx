'use client'

import { useEffect, useRef, useState } from 'react'
import { Job } from '@/types'

interface ProcessingViewProps {
  job: Job
  onComplete: (job: Job) => void
}

const STEPS = [
  { key: 'transcribing', label: 'AI Analyzing', desc: 'Transcribing audio with AssemblyAI…', icon: '🎙️' },
  { key: 'scoring', label: 'Scoring Moments', desc: 'Groq LLM ranking best clips…', icon: '🤖' },
  { key: 'complete', label: 'Clips Ready!', desc: 'Your clips are ready to preview.', icon: '✅' },
]

function getStepIndex(phase: string): number {
  if (phase === 'complete') return 2
  if (phase === 'scoring') return 1
  return 0
}

export default function ProcessingView({ job, onComplete }: ProcessingViewProps) {
  const [phase, setPhase] = useState<string>((job.progress?.phase as string) ?? 'submitting')
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}/poll`)
        if (!res.ok) return

        const data = await res.json()
        if (!isMountedRef.current) return

        setPhase(data.status === 'complete' ? 'complete' : (data.phase ?? data.status ?? 'transcribing'))

        if (data.status === 'complete') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          // Fetch full job to get clips
          const jobRes = await fetch('/api/jobs')
          if (!jobRes.ok) return
          const { jobs } = await jobRes.json()
          const updatedJob = jobs?.find((j: Job) => j.id === job.id)
          if (updatedJob && isMountedRef.current) {
            onComplete(updatedJob)
          }
        }

        if (data.status === 'failed') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          setError(data.error ?? 'Processing failed')
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    poll() // immediate
    intervalRef.current = setInterval(poll, 6000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [job.id, onComplete])

  const stepIndex = getStepIndex(phase)

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl">❌</div>
        <h3 className="text-xl font-bold text-red-400">Processing Failed</h3>
        <p className="text-white/50 text-sm max-w-sm text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-8 max-w-md mx-auto">
      {/* Animated icon */}
      <div className="text-6xl animate-float">{STEPS[Math.min(stepIndex, 2)].icon}</div>

      <div className="text-center">
        <h3 className="text-2xl font-bold text-white mb-2">
          {STEPS[Math.min(stepIndex, 2)].label}
        </h3>
        <p className="text-white/50">{STEPS[Math.min(stepIndex, 2)].desc}</p>
        {job.title && (
          <p className="text-white/30 text-sm mt-1 truncate max-w-xs">{job.title}</p>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                i < stepIndex
                  ? 'bg-green-500 text-white'
                  : i === stepIndex
                  ? 'text-white animate-pulse-glow'
                  : 'bg-white/10 text-white/30'
              }`}
              style={i === stepIndex ? { background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' } : {}}
            >
              {i < stepIndex ? '✓' : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-0.5 ${i < stepIndex ? 'bg-green-500' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {phase !== 'complete' && (
        <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}>
            <div className="absolute inset-0 bg-white/30 animate-shimmer" />
          </div>
        </div>
      )}

      <p className="text-white/30 text-xs">Polling every 6s — this can take a minute</p>
    </div>
  )
}
