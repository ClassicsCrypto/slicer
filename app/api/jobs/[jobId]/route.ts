import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { mirrorJobToShadowSqlite, removeJobFromShadowSqlite } from '@/lib/job-store/shadow'
import { normalizeClips } from '@/lib/clip-id'
import { normalizeSourceUrl } from '@/lib/source-url'
import { Job } from '@/types'

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

export async function DELETE(_request: NextRequest, { params }: { params: { jobId: string } }) {
  const supabase = createServerClient()

  await supabase.from('clips').delete().eq('job_id', params.jobId)
  const { error: jobError } = await supabase.from('jobs').delete().eq('id', params.jobId)

  if (jobError) {
    return NextResponse.json({ error: jobError.message }, { status: 500 })
  }

  await removeJobFromShadowSqlite(params.jobId, 'api/jobs/[jobId] DELETE')
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest, { params }: { params: { jobId: string } }) {
  const supabase = createServerClient()

  try {
    const body = await request.json()
    const { data: existingJob, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', params.jobId)
      .single()

    if (fetchError || !existingJob) {
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

    const { data, error } = await supabase
      .from('jobs')
      .update(patch)
      .eq('id', params.jobId)
      .select('*')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Job not found' }, { status: 404 })
    }

    await mirrorJobToShadowSqlite(data, 'api/jobs/[jobId] PATCH')
    return NextResponse.json({ job: await normalizeJob(data) })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  const supabase = createServerClient()

  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.jobId)
    .single()

  if (fetchError || !job) {
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
      headers: { 'Content-Type': 'application/json' },
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
