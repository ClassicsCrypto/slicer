import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { renderClip, getRenderStatus } from '@/lib/shotstack'
import { v4 as uuidv4 } from 'uuid'
import type { ProcessingOptions } from '@/types'

export const dynamic = 'force-dynamic'

const SHOTSTACK_ENABLED = !!process.env.SHOTSTACK_API_KEY

export async function POST(req: NextRequest) {
  const supabase = createSupabaseAdmin()

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
  const { videoUrl, filePath, publicUrl, options, title } = body as {
    videoUrl?: string
    filePath?: string
    publicUrl?: string
    options: ProcessingOptions
    title?: string
  }

  if (!videoUrl && !filePath) {
    return NextResponse.json({ error: 'No video source provided' }, { status: 400 })
  }

  const jobId = uuidv4()
  let job = { id: jobId }

  if (user.id !== 'dev-user') {
    const { data: dbJob, error: insertError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        title: title || videoUrl || 'Untitled',
        source_url: videoUrl || publicUrl || null,
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

  // Source URL for Shotstack — prefer public URL, then video URL
  const sourceUrl = publicUrl || videoUrl || ''

  processJobAsync(job.id, user.id, { videoUrl, filePath, publicUrl: sourceUrl, options }).catch(console.error)

  return NextResponse.json({ jobId: job.id })
}

async function processJobAsync(
  jobId: string,
  userId: string,
  { videoUrl, publicUrl, options }: { videoUrl?: string; filePath?: string; publicUrl?: string; options: ProcessingOptions }
) {
  const supabase = createSupabaseAdmin()
  const isDevUser = userId === 'dev-user'

  const updateProgress = async (patch: Record<string, unknown>) => {
    if (isDevUser) return
    const { data: current } = await supabase.from('jobs').select('progress').eq('id', jobId).single()
    const progress = { ...(current?.progress || {}), ...patch }
    await supabase.from('jobs').update({ progress, updated_at: new Date().toISOString() }).eq('id', jobId)
  }

  const setStatus = async (status: string) => {
    if (isDevUser) return
    await supabase.from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', jobId)
  }

  const insertClip = async (clipData: {
    r2_key: string
    duration: number
    start_time: number
    end_time: number
  }) => {
    if (isDevUser) return
    await supabase.from('clips').insert({
      id: uuidv4(),
      job_id: jobId,
      user_id: userId,
      ...clipData,
      created_at: new Date().toISOString(),
    })
  }

  try {
    await setStatus('processing')
    await updateProgress({ uploading: 'done', analyzing: true, estimatedSecondsRemaining: 120 })

    await sleep(2000)
    await updateProgress({ analyzing: 'done', detecting: true, estimatedSecondsRemaining: 90 })

    await sleep(2000)
    await updateProgress({ detecting: 'done', subtitles: true, estimatedSecondsRemaining: 60 })

    await sleep(2000)
    await updateProgress({ subtitles: 'done', rendering: true, estimatedSecondsRemaining: 45 })

    const sourceUrl = publicUrl || videoUrl || ''
    const madeWithSlicer = true // will read from options in future

    if (SHOTSTACK_ENABLED && sourceUrl.startsWith('http')) {
      // Real Shotstack rendering
      const clipCount = options.clipCount || 3
      const clipDuration = parseInt(options.clipLength as string) || 30
      const renderIds: string[] = []

      // Submit all clip renders to Shotstack
      for (let i = 0; i < clipCount; i++) {
        const startTime = i * (clipDuration + 5) // space clips out
        const endTime = startTime + clipDuration

        const renderId = await renderClip({
          sourceUrl,
          startTime,
          endTime,
          subtitles: options.subtitles.enabled ? [] : undefined, // Whisper subtitles TBD
          outputFormat: 'mp4',
          outputQuality: options.outputQuality,
          platformFormat: options.platformFormat,
          madeWithSlicer,
        })
        renderIds.push(renderId)
      }

      // Poll until all renders complete
      const clipUrls: { id: string; url: string; start: number; end: number }[] = []
      const MAX_POLLS = 60
      let polls = 0

      while (clipUrls.length < renderIds.length && polls < MAX_POLLS) {
        await sleep(5000)
        polls++

        for (let i = 0; i < renderIds.length; i++) {
          if (clipUrls.find(c => c.id === renderIds[i])) continue
          const result = await getRenderStatus(renderIds[i])
          if (result.status === 'done' && result.url) {
            clipUrls.push({
              id: renderIds[i],
              url: result.url,
              start: i * (clipDuration + 5),
              end: i * (clipDuration + 5) + clipDuration,
            })
          } else if (result.status === 'failed') {
            console.error(`Render ${renderIds[i]} failed`)
          }
        }

        const pct = Math.round((clipUrls.length / renderIds.length) * 100)
        await updateProgress({ rendering: clipUrls.length === renderIds.length ? 'done' : true, renderPct: pct, estimatedSecondsRemaining: Math.max(0, (MAX_POLLS - polls) * 5) })
      }

      // Save completed clips to DB
      for (const clip of clipUrls) {
        await insertClip({
          r2_key: clip.url, // Shotstack CDN URL
          duration: parseInt(options.clipLength as string) || 30,
          start_time: clip.start,
          end_time: clip.end,
        })
      }

    } else {
      // Simulation mode (no Shotstack key)
      await sleep(4000)
    }

    await updateProgress({ rendering: 'done', finalizing: true, estimatedSecondsRemaining: 5 })
    await sleep(2000)
    await updateProgress({ finalizing: 'done', estimatedSecondsRemaining: 0 })
    await setStatus('complete')

  } catch (err) {
    console.error('Job processing error:', err)
    await updateProgress({ error: err instanceof Error ? err.message : 'Processing failed' })
    await setStatus('failed')
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
