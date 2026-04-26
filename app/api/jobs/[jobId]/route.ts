import { NextRequest, NextResponse } from 'next/server'
import { deleteJobRecord, getJobRecord, updateJobRecord } from '@/lib/job-store/store'
import { normalizeClips } from '@/lib/clip-id'
import { normalizeSourceUrl } from '@/lib/source-url'
import { Job } from '@/types'
import { requireAuth } from '@/lib/auth'

async function normalizeJob(job: any): Promise<Job> {
  const progress = job.progress ?? {}
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

export async function DELETE(request: NextRequest, { params }: { params: { jobId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const existingJob = await getJobRecord(params.jobId, 'api/jobs/[jobId] DELETE fetch')
  if (!existingJob || existingJob.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { error: jobError } = await deleteJobRecord(params.jobId, 'api/jobs/[jobId] DELETE')

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest, { params }: { params: { jobId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const existingJob = await getJobRecord(params.jobId, 'api/jobs/[jobId] PATCH fetch')
    const fetchError = !existingJob ? new Error('Job not found') : null

    if (fetchError || !existingJob || existingJob.user_id !== auth.user.id) {
      return NextResponse.json({ error: fetchError?.message || 'Job not found' }, { status: 404 })
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof body.status === 'string') patch.status = body.status
    if (body.progress && typeof body.progress === 'object') {
      patch.progress = {
        ...(existingJob.progress ?? {}),
        ...body.progress,
      }
    }
    if (typeof body.title === 'string') patch.title = body.title
    if (body.options && typeof body.options === 'object') patch.options = body.options
    if (typeof body.sourceUrl === 'string') patch.source_url = body.sourceUrl

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 })
    }

    const data = await updateJobRecord(params.jobId, patch, 'api/jobs/[jobId] PATCH')
    const error = !data ? new Error('Job not found') : null

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Job not found' }, { status: 404 })
    }
    return NextResponse.json({ job: await normalizeJob(data) })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const job = await getJobRecord(params.jobId, 'api/jobs/[jobId] POST fetch')
  const fetchError = !job ? new Error('Job not found') : null

  if (fetchError || !job || job.user_id !== auth.user.id) {
    return NextResponse.json({ error: fetchError?.message || 'Job not found' }, { status: 404 })
  }

  try {
    const { action } = await request.json()
    if (action !== 'rescore' && action !== 'retry') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
    }

    const progressRawInputUrl = job.progress?.rawInputUrl as string | undefined
    const inferredRemoteSource = typeof job.source_url === 'string'
      && /^https?:\/\//i.test(job.source_url)
      && !job.source_url.includes('/serve/')
        ? job.source_url
        : undefined
    const rawInputUrl = progressRawInputUrl || inferredRemoteSource
    const sourceUrl = rawInputUrl ? undefined : job.source_url
    const inputKind = rawInputUrl ? 'remote_url' : 'uploaded_file'

    const processPayload = action === 'rescore'
      ? {
          jobId: params.jobId,
          title: job.title,
          sourceUrl: job.source_url,
          options: job.options ?? {},
          inputKind: 'uploaded_file',
          rescoreOnly: true,
        }
      : {
          jobId: params.jobId,
          title: job.title,
          sourceUrl,
          rawInputUrl,
          options: job.options ?? {},
          inputKind,
        }

    const processResponse = await fetch(`${request.nextUrl.origin}/api/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify(processPayload),
    })

    if (!processResponse.ok) {
      const errorPayload = await processResponse.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorPayload.error ?? `Failed to start ${action}` },
        { status: 500 },
      )
    }

    const { job: updatedJob } = await processResponse.json()
    return NextResponse.json({ job: await normalizeJob(updatedJob) })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
