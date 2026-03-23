import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRenderStatus } from '@/lib/shotstack'
import { v4 as uuidv4 } from 'uuid'

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

  const reqUrl = new URL(req.url)
  const queryUserId = reqUrl.searchParams.get('userId')
  let userId = queryUserId || 'dev-user'

  if (!queryUserId) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (token.length > 10) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token)
        if (user) userId = user.id
      } catch { /* ignore */ }
    }
  }

  // Get job + current progress
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.jobId)
    .eq('user_id', userId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Already done or failed — just return current state
  if (job.status === 'complete' || job.status === 'failed') {
    const { data: clips } = await supabase.from('clips').select('*').eq('job_id', params.jobId)
    return NextResponse.json({ ...job, clips: clips || [] })
  }

  const renderIds: string[] = job.progress?.renderIds || []

  if (!renderIds.length || !process.env.SHOTSTACK_API_KEY) {
    // No Shotstack renders — simulation mode, just mark complete
    await supabase.from('jobs').update({
      status: 'complete',
      progress: { ...job.progress, rendering: 'done', finalizing: 'done', estimatedSecondsRemaining: 0 },
    }).eq('id', params.jobId)
    return NextResponse.json({ ...job, status: 'complete', clips: [] })
  }

  // Check each render
  const options = job.options || {}
  const clipDuration = parseInt(options.clipLength as string) || 30
  let allDone = true
  let anyFailed = false
  const completedCount = job.progress?.completedCount || 0
  let newCompletedCount = completedCount

  // Per-clip category assignments saved during process submission
  const clipCategories: string[][] = job.progress?.clipCategories || []

  for (let i = 0; i < renderIds.length; i++) {
    const renderId = renderIds[i]

    // Skip if this render already saved as a clip
    const { data: existingClip } = await supabase
      .from('clips')
      .select('id')
      .eq('job_id', params.jobId)
      .eq('r2_key', renderId)  // we use renderId as temp key
      .single()

    if (existingClip) continue // already saved

    try {
      const result = await getRenderStatus(renderId)
      console.log(`[poll] render ${renderId} status: ${result.status} url: ${result.url || 'none'}`)

      if (result.status === 'done' && result.url) {
        // Save the clip to DB
        const startTime = i * (clipDuration + 5)
        const endTime = startTime + clipDuration
        const matchedCategories = clipCategories[i] || []

        const { error: insertError } = await supabase.from('clips').insert({
          id: uuidv4(),
          job_id: params.jobId,
          user_id: userId,
          r2_key: result.url,           // Shotstack CDN URL — direct download
          duration: clipDuration,
          start_time: startTime,
          end_time: endTime,
          matched_categories: matchedCategories,
          created_at: new Date().toISOString(),
        })
        if (insertError) {
          console.error(`[poll] clip insert failed for render ${renderId}:`, JSON.stringify(insertError))
        } else {
          console.log(`[poll] clip saved for render ${renderId} url: ${result.url}`)
          newCompletedCount++
        }
      } else if (result.status === 'failed') {
        anyFailed = true
        console.error(`Render ${renderId} failed`)
      } else {
        // Still rendering
        allDone = false
      }
    } catch (err) {
      console.error(`Error checking render ${renderId}:`, err)
      allDone = false
    }
  }

  const pct = Math.round((newCompletedCount / renderIds.length) * 100)
  const remaining = Math.max(0, (renderIds.length - newCompletedCount) * 30)

  if (allDone || newCompletedCount === renderIds.length) {
    // All renders complete — mark job done
    await supabase.from('jobs').update({
      status: anyFailed && newCompletedCount === 0 ? 'failed' : 'complete',
      progress: {
        ...job.progress,
        rendering: 'done',
        finalizing: 'done',
        estimatedSecondsRemaining: 0,
        completedCount: newCompletedCount,
      },
    }).eq('id', params.jobId)
  } else {
    // Still in progress — update progress
    await supabase.from('jobs').update({
      progress: {
        ...job.progress,
        rendering: true,
        renderPct: pct,
        estimatedSecondsRemaining: remaining,
        completedCount: newCompletedCount,
      },
    }).eq('id', params.jobId)
  }

  // Return updated job + clips
  const { data: clips } = await supabase.from('clips').select('*').eq('job_id', params.jobId)
  const updatedJob = {
    ...job,
    status: allDone || newCompletedCount === renderIds.length
      ? (anyFailed && newCompletedCount === 0 ? 'failed' : 'complete')
      : 'processing',
    progress: {
      ...job.progress,
      renderPct: pct,
      estimatedSecondsRemaining: remaining,
      completedCount: newCompletedCount,
    },
  }

  return NextResponse.json({ ...updatedJob, clips: clips || [] })
}
