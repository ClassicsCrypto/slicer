'use client'

import React, { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import type { ProcessingProgress } from '@/types'

const CHECKLIST_ITEMS = [
  { key: 'uploading', label: 'Uploading video' },
  { key: 'analyzing', label: 'Analyzing content with AI' },
  { key: 'detecting', label: 'Detecting highlight moments' },
  { key: 'subtitles', label: 'Generating subtitles' },
  { key: 'rendering', label: 'Rendering clips' },
  { key: 'finalizing', label: 'Finalizing export' },
] as const

interface ProcessingViewProps {
  jobId: string
  onCancel: () => void
  onComplete: () => void
}

export default function ProcessingView({ jobId, onCancel, onComplete }: ProcessingViewProps) {
  const [progress, setProgress] = useState<ProcessingProgress>({})
  const [status, setStatus] = useState<'processing' | 'complete' | 'failed'>('processing')
  const supabase = createSupabaseClient()

  useEffect(() => {
    // Poll for progress
    const interval = setInterval(async () => {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (!res.ok) return
      const data = await res.json()
      setProgress(data.progress || {})
      if (data.status === 'complete') {
        setStatus('complete')
        clearInterval(interval)
        setTimeout(onComplete, 2000)
      } else if (data.status === 'failed') {
        setStatus('failed')
        clearInterval(interval)
      }
    }, 2000)

    // Also subscribe to Supabase realtime
    const channel = supabase
      .channel(`job-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${jobId}`,
      }, (payload) => {
        const job = payload.new as { progress: ProcessingProgress; status: string }
        setProgress(job.progress || {})
        if (job.status === 'complete') {
          setStatus('complete')
          clearInterval(interval)
          setTimeout(onComplete, 2000)
        } else if (job.status === 'failed') {
          setStatus('failed')
          clearInterval(interval)
        }
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [jobId, supabase, onComplete])

  const getItemStatus = (key: string): 'pending' | 'active' | 'done' => {
    const val = progress[key as keyof ProcessingProgress]
    if (val === 'done') return 'done'
    if (val === true) return 'active'
    return 'pending'
  }

  const doneCount = CHECKLIST_ITEMS.filter(i => getItemStatus(i.key) === 'done').length
  const pct = Math.round((doneCount / CHECKLIST_ITEMS.length) * 100)

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-12 px-4">
      {/* MCV Cat Animation — real MCV cat image */}
      <div className="mb-8 cat-float glow-pulse relative">
        {/* Teal glow ring behind cat */}
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-2xl scale-110 animate-pulse" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/slicer-cat.png"
          alt="MCV Slicer Cat"
          width={160}
          height={160}
          className="relative rounded-2xl drop-shadow-[0_0_24px_rgba(0,191,165,0.7)]"
        />
      </div>

      {/* Status text */}
      <h2 className="text-2xl font-bold mb-1 text-white">
        {status === 'complete' ? '✅ Done!' : status === 'failed' ? '❌ Failed' : '⚡ Processing...'}
      </h2>
      <p className="text-muted text-sm mb-8">
        {status === 'complete' ? 'Your clips are ready!' : status === 'failed' ? (progress.error || 'Something went wrong') : 'The MCV AI is working hard on your clips'}
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-sm mb-8">
        <div className="flex justify-between text-xs text-muted mb-2">
          <span>Progress</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        {progress.estimatedSecondsRemaining != null && status === 'processing' && (
          <p className="text-xs text-muted mt-2 text-center">
            Est. {Math.ceil(progress.estimatedSecondsRemaining / 60)} min remaining
          </p>
        )}
      </div>

      {/* Checklist */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        {CHECKLIST_ITEMS.map((item) => {
          const s = getItemStatus(item.key)
          return (
            <div key={item.key} className={`flex items-center gap-3 check-in ${s === 'pending' ? 'opacity-40' : 'opacity-100'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                s === 'done' ? 'bg-primary text-background' :
                s === 'active' ? 'border-2 border-primary' :
                'border-2 border-white/20'
              }`}>
                {s === 'done' && (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {s === 'active' && (
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <span className={`text-sm ${s === 'done' ? 'text-primary' : s === 'active' ? 'text-white font-semibold' : 'text-muted'}`}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Cancel */}
      {status === 'processing' && (
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </div>
  )
}
