import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createJobRecord, listJobRecordsForUsers, updateJobRecord } from '@/lib/job-store/store'
import { normalizeClips } from '@/lib/clip-id'
import { normalizeSourceUrl } from '@/lib/source-url'
import { Job, JobProgress } from '@/types'
import { requireAuth } from '@/lib/auth'

const STALE_JOB_MS = 2 * 60 * 60 * 1000

function buildInitialProgress(payload: {
  inputKind: 'remote_url' | 'uploaded_file'
  rawInputUrl?: string
  requestedClipCount?: number
}): JobProgress {
  return {
    phase: 'queued',
    progress: 'Waiting for processor...',
    inputKind: payload.inputKind,
    rawInputUrl: payload.rawInputUrl,
    sourceReady: false,
    requestedClipCount: payload.requestedClipCount,
    deliveredClipCount: 0,
    aiReturnedClipCount: 0,
    duplicateClipsRemoved: 0,
    processingStartedAt: new Date().toISOString(),
  }
}

async function normalizeJob(job: any): Promise<Job> {
  const progress = (job.progress ?? {}) as JobProgress
  const completedClips = normalizeClips((progress.completedClips ?? []) as Job['clips'])
  return {
    ...job,
    source_url: await normalizeSourceUrl(job.source_url),
    clips: completedClips as Job['clips'],
    progress: {
      ...progress,
      completedClips,
    },
  }
}

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
  }, 'api/jobs recoverStaleJob')) ?? { ...job, status: 'failed', progress }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  let jobsData: any[] = []
  try {
    jobsData = await listJobRecordsForUsers([auth.user.id], 50, 'api/jobs GET')
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to list jobs' }, { status: 500 })
  }
  const recoveredJobs = await Promise.all(jobsData.map((job) => recoverStaleJob(job)))
  const normalizedJobs = await Promise.all(recoveredJobs.map((job) => normalizeJob(job)))
  return NextResponse.json({ jobs: normalizedJobs })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const createdAt = new Date().toISOString()

  const sourceUrl = body.inputKind === 'uploaded_file' ? body.sourceUrl : undefined
  const rawInputUrl = body.inputKind === 'remote_url' ? body.rawInputUrl : body.sourceUrl
  const initialProgress = buildInitialProgress({
    inputKind: body.inputKind,
    rawInputUrl,
    requestedClipCount: body.options?.clipCount,
  })

  try {
    const data = await createJobRecord({
      id: body.jobId || uuidv4(),
      user_id: auth.user.id,
      title: body.title || 'Untitled Video',
      source_url: sourceUrl,
      options: body.options || {},
      status: 'processing',
      progress: initialProgress,
      created_at: createdAt,
      updated_at: createdAt,
    }, 'api/jobs POST create')

    return NextResponse.json({ job: await normalizeJob(data) })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create job' }, { status: 500 })
  }
}
