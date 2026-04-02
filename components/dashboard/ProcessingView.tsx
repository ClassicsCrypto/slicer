'use client'

import { useEffect, useRef, useState } from 'react'
import { Job } from '@/types'

interface ProcessingViewProps {
  job: Job
  onComplete: (job: Job) => void
}

const STEPS = [
  { key: 'submitting', label: 'Launching mission...', icon: '🚀' },
  { key: 'downloading', label: 'Downloading video...', icon: '📥' },
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

function getStepIndex(phase: string): number {
  const idx = STEPS.findIndex(s => s.key === phase)
  return idx >= 0 ? idx : 0
}

export default function ProcessingView({ job, onComplete }: ProcessingViewProps) {
  const [phase, setPhase] = useState<string>((job.progress?.phase as string) ?? 'submitting')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)
  const startTime = useRef(Date.now())

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

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

        if (data.status === 'complete') {
          setPhase('complete')
          if (intervalRef.current) clearInterval(intervalRef.current)
          const jobRes = await fetch('/api/jobs')
          if (!jobRes.ok) return
          const { jobs } = await jobRes.json()
          const updatedJob = jobs?.find((j: Job) => j.id === job.id)
          if (updatedJob && isMountedRef.current) {
            setTimeout(() => onComplete(updatedJob), 1500)
          }
        } else if (data.status === 'failed') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          setError(data.error ?? 'Processing failed')
        } else {
          setPhase(data.phase ?? 'transcribing')
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [job.id, onComplete])

  const stepIndex = getStepIndex(phase)
  const progress = phase === 'complete' ? 100 : Math.min(95, (stepIndex / (STEPS.length - 1)) * 100 + elapsed * 0.3)

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="text-4xl">❌</div>
        <h3 className="text-lg font-bold text-red-400">Processing Failed</h3>
        <p className="text-white/50 text-sm max-w-sm text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="py-8 space-y-6">
      {/* Current status */}
      <div className="flex items-center gap-4">
        <div className={`text-3xl ${phase === 'complete' ? '' : 'animate-pulse'}`}>
          {STEPS[Math.min(stepIndex, STEPS.length - 1)].icon}
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">
            {STEPS[Math.min(stepIndex, STEPS.length - 1)].label}
          </h3>
          <p className="text-white/40 text-sm">
            {phase === 'complete' ? 'Your clips are ready!' : MCV_MESSAGES[Math.floor(elapsed / 8) % MCV_MESSAGES.length]}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${progress}%`,
            background: phase === 'complete' ? '#22c55e' : 'linear-gradient(90deg, #FF4D4D, #FF6B6B)',
          }}
        />
      </div>

      {/* Steps checklist */}
      <div className="space-y-2">
        {STEPS.map((step, i) => {
          const isDone = i < stepIndex || phase === 'complete'
          const isActive = i === stepIndex && phase !== 'complete'
          return (
            <div key={step.key} className={`flex items-center gap-3 py-1.5 transition-all ${isDone || isActive ? 'opacity-100' : 'opacity-30'}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
                isDone ? 'bg-green-500 text-white' : isActive ? 'border-2 border-red-500' : 'border border-white/20'
              }`}>
                {isDone ? '✓' : isActive ? <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> : ''}
              </div>
              <span className={`text-sm ${isDone ? 'text-white/60' : isActive ? 'text-white font-semibold' : 'text-white/30'}`}>
                {step.label}
              </span>
            </div>
          )
        })}
      </div>

      <p className="text-white/20 text-xs">{elapsed}s elapsed</p>
    </div>
  )
}
