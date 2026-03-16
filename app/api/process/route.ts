import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'
import type { ProcessingOptions } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createSupabaseAdmin()

  // Auth — allow unauthenticated in dev mode
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  let userId = 'dev-user'

  if (token) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  } else if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = { id: userId }

  const body = await req.json()
  const { videoUrl, filePath, options, title } = body as {
    videoUrl?: string
    filePath?: string
    options: ProcessingOptions
    title?: string
  }

  if (!videoUrl && !filePath) {
    return NextResponse.json({ error: 'No video source provided' }, { status: 400 })
  }

  // Create job in Supabase (skip DB insert in dev mode with no real user)
  const jobId = uuidv4()
  let job = { id: jobId }

  if (user.id !== 'dev-user') {
    const { data: dbJob, error: insertError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        title: title || videoUrl || 'Untitled',
        source_url: videoUrl || null,
        r2_key: filePath || null,
        status: 'pending',
        options,
        progress: {},
      })
      .select()
      .single()

    if (insertError || !dbJob) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }
    job = dbJob
  }

  // Start async processing (fire and forget)
  // In production, you'd queue this via a background worker (Inngest, QStash, etc.)
  // Here we kick it off as a background process
  processJobAsync(job.id, user.id, { videoUrl, filePath, options }).catch(console.error)

  return NextResponse.json({ jobId: job.id })
}

/**
 * Async job processor — runs in background.
 * Updates progress in Supabase as it goes.
 * In production, move this to a separate worker/queue.
 */
async function processJobAsync(
  jobId: string,
  userId: string,
  { videoUrl, filePath, options }: { videoUrl?: string; filePath?: string; options: ProcessingOptions }
) {
  const supabase = createSupabaseAdmin()

  const updateProgress = async (patch: Record<string, unknown>) => {
    const { data: current } = await supabase.from('jobs').select('progress').eq('id', jobId).single()
    const progress = { ...(current?.progress || {}), ...patch }
    await supabase.from('jobs').update({ progress, updated_at: new Date().toISOString() }).eq('id', jobId)
  }

  const setStatus = async (status: string) => {
    await supabase.from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', jobId)
  }

  try {
    await setStatus('processing')
    await updateProgress({ uploading: true, estimatedSecondsRemaining: 300 })

    // Step 1: Uploading (already done, mark done)
    await sleep(1000)
    await updateProgress({ uploading: 'done', analyzing: true, estimatedSecondsRemaining: 240 })

    // Step 2: Analyzing
    await sleep(3000)
    await updateProgress({ analyzing: 'done', detecting: true, estimatedSecondsRemaining: 180 })

    // Step 3: Detecting highlights
    await sleep(3000)
    await updateProgress({ detecting: 'done', subtitles: true, estimatedSecondsRemaining: 120 })

    // Step 4: Generating subtitles
    if (options.subtitles.enabled) {
      await generateSubtitles(jobId, userId, { videoUrl, filePath, options })
    }
    await updateProgress({ subtitles: 'done', rendering: true, estimatedSecondsRemaining: 60 })

    // Step 5: Rendering clips
    await sleep(3000)
    await updateProgress({ rendering: 'done', finalizing: true, estimatedSecondsRemaining: 10 })

    // Step 6: Finalizing
    await sleep(2000)
    await updateProgress({ finalizing: 'done', estimatedSecondsRemaining: 0 })

    await setStatus('complete')
  } catch (err) {
    console.error('Job processing error:', err)
    await updateProgress({ error: err instanceof Error ? err.message : 'Processing failed' })
    await setStatus('failed')
  }
}

async function generateSubtitles(
  jobId: string,
  userId: string,
  { options }: { videoUrl?: string; filePath?: string; options: ProcessingOptions }
) {
  // If OPENAI_API_KEY is set, use Whisper API
  if (!process.env.OPENAI_API_KEY) {
    console.log('No OpenAI API key — skipping subtitles')
    return
  }
  // In production: download video from R2, send to Whisper, parse response, save to DB
  await sleep(2000)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
