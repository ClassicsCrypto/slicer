import { NextRequest, NextResponse } from 'next/server'
import { getJobRecord, mutateJobRecord } from '@/lib/job-store/store'
import { requireAuth } from '@/lib/auth'
import { JobProgress } from '@/types'

export const maxDuration = 30

const STALE_JOB_MS = 2 * 60 * 60 * 1000
const STALE_DOWNLOAD_JOB_MS = 45 * 60 * 1000

function getActivityTimestamp(job: any): number {
  const progress = (job?.progress ?? {}) as JobProgress
  // For processing jobs, updated_at is the real activity signal: worker
  // progress ticks bump it constantly, while processingStartedAt is written
  // once at kickoff and never refreshed — anchoring on it falsely failed any
  // job that legitimately ran longer than the stale window.
  const candidate = job?.status === 'processing'
    ? (job?.updated_at || progress.processingStartedAt || job?.created_at)
    : (progress.completedAt || job?.updated_at || progress.processingStartedAt || job?.created_at)
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
  const progress = (job.progress ?? {}) as JobProgress
  const staleAfterMs = progress.phase === 'downloading' ? STALE_DOWNLOAD_JOB_MS : STALE_JOB_MS
  if (ageMs < staleAfterMs) return job

  // Re-check on the fresh row inside the transaction: the worker may have
  // completed the job (or bumped activity) since our read above. Returning
  // null skips the write entirely — this is what prevents the
  // complete→failed stamp.
  const updated = await mutateJobRecord(job.id, (existing) => {
    if (existing?.status !== 'processing') return null
    const freshAgeMs = Date.now() - getActivityTimestamp(existing)
    const freshProgress = (existing.progress ?? {}) as JobProgress
    const freshStaleAfterMs = freshProgress.phase === 'downloading' ? STALE_DOWNLOAD_JOB_MS : STALE_JOB_MS
    if (freshAgeMs < freshStaleAfterMs) return null
    return {
      ...existing,
      status: 'failed',
      progress: buildTimedOutProgress((existing.progress ?? {}) as JobProgress, freshAgeMs),
      updated_at: new Date().toISOString(),
    }
  }, 'api/jobs/[jobId]/poll recoverStaleJob')

  return updated ?? job
}

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const data = await getJobRecord(params.jobId, 'api/jobs/[jobId]/poll GET fetch')

  if (!data || data.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
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
