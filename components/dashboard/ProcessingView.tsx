'use client'

import React, { useEffect, useState, useRef } from 'react'
import { createSupabaseClient } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import type { ProcessingProgress } from '@/types'

const CHECKLIST_ITEMS = [
  { key: 'uploading',  label: 'Uploading video' },
  { key: 'analyzing',  label: 'Transcribing audio with Whisper' },
  { key: 'detecting',  label: 'Finding highlights with GPT-4o' },
  { key: 'subtitles',  label: 'Preparing subtitles' },
  { key: 'rendering',  label: 'Rendering clips' },
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
  const completed = useRef(false)
  const supabase = createSupabaseClient()

  useEffect(() => {
    if (completed.current) return

    // Dev mode simulation (no real jobId from server)
    if (jobId.startsWith('dev-') || jobId.startsWith('pending-')) {
      const steps = [
        { key: 'uploading',  delay: 1500,  est: 120 },
        { key: 'analyzing',  delay: 4000,  est: 90  },
        { key: 'detecting',  delay: 5000,  est: 60  },
        { key: 'subtitles',  delay: 5000,  est: 45  },
        { key: 'rendering',  delay: 6000,  est: 20  },
        { key: 'finalizing', delay: 3000,  est: 0   },
      ]
      let cancelled = false
      const run = async () => {
        for (const step of steps) {
          if (cancelled) return
          setProgress(prev => ({ ...prev, [step.key]: true, estimatedSecondsRemaining: step.est }))
          await new Promise(r => setTimeout(r, step.delay))
          if (cancelled) return
          setProgress(prev => ({ ...prev, [step.key]: 'done' }))
        }
        if (!cancelled) {
          setStatus('complete')
          setTimeout(onComplete, 1500)
        }
      }
      run()
      return () => { cancelled = true }
    }

    // Real job — poll the poll endpoint every 8 seconds
    // Also subscribe to Supabase Realtime for instant updates
    const pollJob = async () => {
      if (completed.current) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        const pollUrl = userId ? `/api/jobs/${jobId}/poll?userId=${userId}` : `/api/jobs/${jobId}/poll`
        const res = await fetch(pollUrl)
        if (!res.ok) return

        const data = await res.json()
        setProgress(data.progress || {})

        if (data.status === 'complete') {
          if (!completed.current) {
            completed.current = true
            setStatus('complete')
            setTimeout(onComplete, 1500)
          }
        } else if (data.status === 'failed') {
          setStatus('failed')
        }
      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    // Initial poll immediately
    pollJob()

    // Then poll every 8 seconds
    const interval = setInterval(pollJob, 8000)

    // Also listen via Realtime
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
        if (job.status === 'complete' && !completed.current) {
          completed.current = true
          clearInterval(interval)
          setStatus('complete')
          setTimeout(onComplete, 1500)
        } else if (job.status === 'failed') {
          clearInterval(interval)
          setStatus('failed')
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
      {/* MCV Cat Animation */}
      <div className="mb-8 relative flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl scale-125 animate-pulse" />
        <video
          src="/slicer-cat.mp4"
          autoPlay loop muted playsInline
          width={220} height={220}
          className="relative rounded-2xl drop-shadow-[0_0_32px_rgba(0,191,165,0.8)]"
        />
      </div>

      <h2 className="text-2xl font-bold mb-1 text-white">
        {status === 'complete' ? '✅ Done!' : status === 'failed' ? '❌ Failed' : '⚡ Processing...'}
      </h2>
      <p className="text-muted text-sm mb-8">
        {status === 'complete'
          ? 'Your clips are ready!'
          : status === 'failed'
          ? ((progress as Record<string, unknown>).error as string || 'Something went wrong')
          : 'The MCV AI is working hard on your clips'}
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
            Est.{' '}
            {progress.estimatedSecondsRemaining >= 60
              ? `${Math.ceil(progress.estimatedSecondsRemaining / 60)} min`
              : `${progress.estimatedSecondsRemaining}s`}{' '}
            remaining
          </p>
        )}
      </div>

      {/* Checklist */}
      <div className="w-full max-w-sm space-y-3 mb-8">
        {CHECKLIST_ITEMS.map((item) => {
          const s = getItemStatus(item.key)
          return (
            <div key={item.key} className={`flex items-center gap-3 ${s === 'pending' ? 'opacity-40' : 'opacity-100'}`}>
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
                {s === 'active' && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
              </div>
              <span className={`text-sm ${s === 'done' ? 'text-primary' : s === 'active' ? 'text-white font-semibold' : 'text-muted'}`}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>

      {status === 'processing' && (
        <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
      )}
    </div>
  )
}
