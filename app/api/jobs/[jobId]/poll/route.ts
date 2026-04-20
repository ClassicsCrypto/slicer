import { NextRequest, NextResponse } from 'next/server'
import { getJobRecord, updateJobRecord } from '@/lib/job-store/store'
import { JobProgress } from '@/types'

export const maxDuration = 30

const STALE_JOB_MS = 2 * 60 * 60 * 1000

function getActivityTimestamp(job: any): number {
  const progress = (job?.progress ?? {}) as JobProgress
  const candidate = progress.completedAt || job?.updated_at || progress.processingStartedAt || job?.created_at
  const ts = candidate ? new Date(candidate).getTime() : NaN
  return Number.isFinite(ts) ? ts : Date.now()
}

function buildTimedOutProgress(progress: JobProgress, ageMs: number): JobProgress {
  const minutes = Math.max(1, Math.round(ageMs / 60000))
  return {
    ...progress,
    phase: 'failed',
    progress: `Processing timed out after ${minutes} minutes without completing. Please retry.`,
    completedAt: new Date().toISOString(),
  }
}

async function recoverStaleJob(job: any) {
  if (job?.status !== 'processing') return job

  const ageMs = Date.now() - getActivityTimestamp(job)
  if (ageMs < STALE_JOB_MS) return job

  const progress = buildTimedOutProgress((job.progress ?? {}) as JobProgress, ageMs)
  return (await updateJobRecord(job.id, {
    status: 'failed',
    progress,
    updated_at: new Date().toISOString(),
  }, 'api/jobs/[jobId]/poll recoverStaleJob')) ?? { ...job, status: 'failed', progress }
}

export async function GET(_request: NextRequest, { params }: { params: { jobId: string } }) {
  const data = await getJobRecord(params.jobId, 'api/jobs/[jobId]/poll GET fetch')
  const error = !data ? new Error('Job not found') : null

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Job not found' }, { status: 404 })
  }

  const job = await recoverStaleJob(data)
  const progress = (job.progress ?? {}) as JobProgress

  return NextResponse.json({
    status: job.status,
    phase: progress.phase ?? (job.status === 'failed' ? 'failed' : 'queued'),
    progress,
    streamContext: progress.streamContext,
    deliveredClipCount: progress.deliveredClipCount,
    clipShortfallReason: progress.clipShortfallReason,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  })
}
