import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { mirrorJobToShadowSqlite } from '@/lib/job-store/shadow'
import { getServerApiUrl } from '@/lib/api-url-server'
import { Job, JobInputKind, JobProgress, ProcessingOptions } from '@/types'

function normalizeJob(job: any): Job {
  const progress = (job?.progress ?? {}) as JobProgress
  return {
    ...job,
    progress,
    clips: (progress.completedClips ?? []) as Job['clips'],
  }
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function buildProgressUpdate(params: {
  inputKind: JobInputKind
  options: ProcessingOptions
  previous?: JobProgress
  rawInputUrl?: string
  sourceUrl?: string
  rescoreOnly?: boolean
}): JobProgress {
  const { inputKind, options, previous, rawInputUrl, sourceUrl, rescoreOnly } = params

  if (rescoreOnly) {
    return {
      ...(previous ?? {}),
      phase: 'scoring',
      inputKind: 'rescore',
      progress: 'Re-scoring cached transcript...',
      requestedClipCount: options.clipCount,
      deliveredClipCount: 0,
      aiReturnedClipCount: 0,
      duplicateClipsRemoved: 0,
      clipShortfallReason: undefined,
      completedClips: [],
      processingStartedAt: new Date().toISOString(),
    }
  }

  if (inputKind === 'remote_url') {
    return {
      ...(previous ?? {}),
      phase: 'downloading',
      inputKind,
      progress: 'Downloading source stream...',
      requestedClipCount: options.clipCount,
      deliveredClipCount: 0,
      completedClips: [],
      rawInputUrl,
      sourceReady: false,
      processingStartedAt: new Date().toISOString(),
    }
  }

  return {
    ...(previous ?? {}),
    phase: sourceUrl ? 'transcribing' : 'uploading',
    inputKind,
    progress: sourceUrl ? 'Upload complete, starting transcription...' : 'Uploading media...',
    requestedClipCount: options.clipCount,
    deliveredClipCount: 0,
    completedClips: [],
    sourceReady: Boolean(sourceUrl),
    processingStartedAt: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      jobId,
      title,
      sourceUrl,
      rawInputUrl,
      options,
      inputKind,
      rescoreOnly,
    } = body as {
      jobId?: string
      title?: string
      sourceUrl?: string
      rawInputUrl?: string
      options?: ProcessingOptions
      inputKind?: JobInputKind
      rescoreOnly?: boolean
    }

    if (!jobId || !options) {
      return NextResponse.json({ error: 'jobId and options are required' }, { status: 400 })
    }

    const kind: JobInputKind = rescoreOnly ? 'rescore' : (inputKind ?? (rawInputUrl ? 'remote_url' : 'uploaded_file'))

    const supabase = createServerClient()
    const { data: existingJob, error: existingJobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (existingJobError || !existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const progress = buildProgressUpdate({
      inputKind: kind,
      options,
      previous: existingJob.progress,
      rawInputUrl,
      sourceUrl,
      rescoreOnly,
    })

    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({
        title: title?.trim() || existingJob.title,
        source_url: sourceUrl || rawInputUrl || existingJob.source_url,
        status: 'processing',
        options,
        progress,
      })
      .eq('id', jobId)
      .select('*')
      .single()

    if (updateError || !updatedJob) {
      console.error('Process route update error:', updateError)
      return NextResponse.json({ error: 'Failed to update job before processing' }, { status: 500 })
    }

    await mirrorJobToShadowSqlite(updatedJob)

    try {
      const apiBase = await getServerApiUrl()
      const startResponse = await fetch(`${apiBase}/job-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          title: updatedJob.title,
          sourceUrl,
          rawInputUrl,
          options,
          inputKind: kind,
          rescoreOnly: Boolean(rescoreOnly),
        }),
      })

      if (!startResponse.ok) {
        const errorText = await startResponse.text()
        throw new Error(errorText || `job-start failed with ${startResponse.status}`)
      }
    } catch (startError: any) {
      console.error('Process route start error:', startError)
      const { data: failedJob } = await supabase
        .from('jobs')
        .update({
          status: 'failed',
          progress: {
            ...(progress ?? {}),
            phase: 'failed',
            progress: startError?.message ?? 'Failed to start processing job',
          },
        })
        .eq('id', jobId)
        .select('*')
        .single()

      await mirrorJobToShadowSqlite(failedJob ?? {
        ...updatedJob,
        status: 'failed',
        progress: {
          ...(progress ?? {}),
          phase: 'failed',
          progress: startError?.message ?? 'Failed to start processing job',
        },
      })

      return NextResponse.json({ error: 'Failed to start processing job' }, { status: 500 })
    }

    return NextResponse.json({ job: normalizeJob(updatedJob) })
  } catch (error: any) {
    console.error('Process route error:', error)
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}
