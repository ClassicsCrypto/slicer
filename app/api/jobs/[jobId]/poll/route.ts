import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRenderStatus } from '@/lib/shotstack'
import { v4 as uuidv4 } from 'uuid'
import type { AIFocus } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabase()

  // Get job
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Already done or failed
  if (job.status === 'complete' || job.status === 'failed') {
    return NextResponse.json({
      ...job,
      clips: job.progress?.completedClips || [],
    })
  }

  const renderIds: string[] = job.progress?.renderIds || []

  // No renderIds yet — process route still running
  if (!renderIds.length) {
    const jobAge = Date.now() - new Date(job.created_at).getTime()
    if (jobAge > 120000) {
      await supabase.from('jobs').update({
        status: 'failed',
        progress: { ...job.progress, completedClips: [] },
      }).eq('id', params.jobId)
      return NextResponse.json({ ...job, status: 'failed', clips: [] })
    }
    return NextResponse.json({ ...job, clips: [] })
  }

  // Check Shotstack renders
  const completedClips = [...(job.progress?.completedClips || [])]
  const savedRenderIds = completedClips.map((c: { render_id: string }) => c.render_id)
  const clipCategories: AIFocus[][] = job.progress?.clipCategories || []
  const clipReasons: string[] = job.progress?.clipReasons || []
  const clipDuration = parseInt(job.options?.clipLength as string) || 30
  let allDone = true
  let anyFailed = false

  for (let i = 0; i < renderIds.length; i++) {
    const renderId = renderIds[i]
    if (savedRenderIds.includes(renderId)) continue

    try {
      const result = await getRenderStatus(renderId)
      console.log(`[poll] render ${renderId} status: ${result.status}`)

      if (result.status === 'done' && result.url) {
        completedClips.push({
          id: uuidv4(),
          job_id: params.jobId,
          render_id: renderId,
          r2_key: result.url,
          duration: clipDuration,
          start_time: i * Math.ceil(clipDuration / 2),
          end_time: i * Math.ceil(clipDuration / 2) + clipDuration,
          matched_categories: clipCategories[i] || [],
          ai_reason: clipReasons[i] || 'Sequential clip placement',
          created_at: new Date().toISOString(),
        })
      } else if (result.status === 'failed') {
        anyFailed = true
      } else {
        allDone = false
      }
    } catch (err) {
      console.error(`[poll] error checking ${renderId}:`, err)
      allDone = false
    }
  }

  const done = allDone || completedClips.length === renderIds.length

  // Update job with progress + embedded clips
  await supabase.from('jobs').update({
    status: done ? (anyFailed && completedClips.length === 0 ? 'failed' : 'complete') : 'processing',
    progress: {
      ...job.progress,
      completedClips,
      completedCount: completedClips.length,
      renderPct: Math.round((completedClips.length / renderIds.length) * 100),
      estimatedSecondsRemaining: done ? 0 : (renderIds.length - completedClips.length) * 30,
      rendering: done ? 'done' : true,
    },
  }).eq('id', params.jobId)

  // Also write to clips table (best effort, for future queries)
  for (const clip of completedClips) {
    if (!savedRenderIds.includes(clip.render_id)) {
      await supabase.from('clips').upsert({
        ...clip,
        user_id: job.user_id,
      }, { onConflict: 'job_id,render_id' }).then(() => {})
    }
  }

  return NextResponse.json({
    ...job,
    status: done ? 'complete' : 'processing',
    clips: completedClips,
    progress: {
      ...job.progress,
      completedClips,
      completedCount: completedClips.length,
      renderPct: Math.round((completedClips.length / renderIds.length) * 100),
      estimatedSecondsRemaining: done ? 0 : (renderIds.length - completedClips.length) * 30,
    },
  })
}
