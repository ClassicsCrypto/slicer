import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createServerClient } from '@/lib/supabase'
import { mirrorJobToShadowSqlite, mirrorJobsToShadowSqlite } from '@/lib/job-store/shadow'
import { normalizeClips } from '@/lib/clip-id'
import { normalizeSourceUrl } from '@/lib/source-url'
import { Job, JobProgress } from '@/types'

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

async function recoverStaleJob(supabase: ReturnType<typeof createServerClient>, job: any) {
  if (job?.status !== 'processing') return job

  const ageMs = Date.now() - getActivityTimestamp(job)
  if (ageMs < STALE_JOB_MS) return job

  const progress = buildTimedOutProgress((job.progress ?? {}) as JobProgress, ageMs)
  const { data } = await supabase
    .from('jobs')
    .update({ status: 'failed', progress, updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .select('*')
    .single()

  const recoveredJob = data ?? { ...job, status: 'failed', progress }
  await mirrorJobToShadowSqlite(recoveredJob)
  return recoveredJob
}

export async function GET() {
  const supabase = createServerClient()

  const { data: jobsData, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const recoveredJobs = await Promise.all((jobsData ?? []).map((job) => recoverStaleJob(supabase, job)))
  await mirrorJobsToShadowSqlite(recoveredJobs)
  const normalizedJobs = await Promise.all(recoveredJobs.map((job) => normalizeJob(job)))
  return NextResponse.json({ jobs: normalizedJobs })
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()
  const createdAt = new Date().toISOString()

  const sourceUrl = body.inputKind === 'uploaded_file' ? body.sourceUrl : undefined
  const rawInputUrl = body.inputKind === 'remote_url' ? body.rawInputUrl : body.sourceUrl
  const initialProgress = buildInitialProgress({
    inputKind: body.inputKind,
    rawInputUrl,
    requestedClipCount: body.options?.clipCount,
  })

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      id: body.jobId || uuidv4(),
      user_id: '00000000-0000-0000-0000-000000000001',
      title: body.title || 'Untitled Video',
      source_url: sourceUrl,
      options: body.options || {},
      status: 'processing',
      progress: initialProgress,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await mirrorJobToShadowSqlite(data)
  return NextResponse.json({ job: await normalizeJob(data) })
}
