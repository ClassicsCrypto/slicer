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

  const reqUrl = new URL(req.url)
  const queryUserId = reqUrl.searchParams.get('userId')
  let userId = queryUserId || 'dev-user'

  if (!queryUserId) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (token.length > 10) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token)
        if (user) userId = user.id
      } catch (err) {
        console.error('[poll/GET] Auth token validation failed:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  // Get job + current progress — no user_id filter here, service role handles auth
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.jobId)
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
  console.log(`[poll] job ${params.jobId} renderIds: ${renderIds.length} shotstack_key: ${!!process.env.SHOTSTACK_API_KEY}`)

  if (!process.env.SHOTSTACK_API_KEY) {
    // No Shotstack key at all — simulation mode
    console.log(`[poll] no shotstack key — simulation mode`)
    await supabase.from('jobs').update({
      status: 'complete',
      progress: { ...job.progress, rendering: 'done', finalizing: 'done', estimatedSecondsRemaining: 0 },
    }).eq('id', params.jobId)
    return NextResponse.json({ ...job, status: 'complete', clips: [] })
  }

  if (!renderIds.length) {
    // renderIds not yet saved — process route is still running (AssemblyAI + Shotstack submission)
    // Check how old the job is — if > 90s with no renderIds, something went wrong
    const jobAge = Date.now() - new Date(job.created_at).getTime()
    if (jobAge > 120000) {
      console.log(`[poll] no renderIds after 90s — marking failed`)
      await supabase.from('jobs').update({
        status: 'failed',
        progress: { ...job.progress, rendering: 'done', finalizing: 'done', estimatedSecondsRemaining: 0 },
      }).eq('id', params.jobId)
      return NextResponse.json({ ...job, status: 'failed', clips: [] })
    }
    console.log(`[poll] renderIds not yet saved (job age: ${Math.round(jobAge/1000)}s) — waiting`)
    return NextResponse.json({ ...job, status: 'processing', clips: [] })
  }

  // Check each render
  const options = job.options || {}
  const clipDuration = parseInt(options.clipLength as string) || 30
  let allDone = true
  let anyFailed = false

  // Track which renderIds have already been saved — prevents duplicate inserts on every poll
  const savedRenderIds: string[] = job.progress?.savedRenderIds || []
  let newCompletedCount = savedRenderIds.length

  // Per-clip category + reason assignments saved during process submission
  const clipCategories: AIFocus[][] = (job.progress?.clipCategories || []) as AIFocus[][]
  const clipReasons: string[] = job.progress?.clipReasons || []

  for (let i = 0; i < renderIds.length; i++) {
    const renderId = renderIds[i]

    // Skip if already saved in a previous poll
    if (savedRenderIds.includes(renderId)) continue

    try {
      const result = await getRenderStatus(renderId)
      console.log(`[poll] render ${renderId} status: ${result.status} url: ${result.url || 'none'}`)

      if (result.status === 'done' && result.url) {
        const startTime = i * Math.ceil(clipDuration / 2)
        const endTime = startTime + clipDuration
        const matchedCategories = clipCategories[i] || []

        const { error: insertError } = await supabase.from('clips').insert({
          id: uuidv4(),
          job_id: params.jobId,
          user_id: userId,
          r2_key: result.url,
          render_id: renderId,
          duration: clipDuration,
          start_time: startTime,
          end_time: endTime,
          matched_categories: matchedCategories,
          ai_reason: clipReasons[i] || null,
          created_at: new Date().toISOString(),
        })
        if (insertError) {
          // code 23505 = unique_violation — means already saved, not a real error
          const errorCode = (insertError as unknown as { code?: string }).code
          if (errorCode === '23505') {
            console.log(`[poll] clip already saved for render ${renderId} — skipping`)
            savedRenderIds.push(renderId)
            newCompletedCount++
          } else {
            console.error(`[poll] clip insert failed for render ${renderId}:`, JSON.stringify(insertError))
          }
        } else {
          console.log(`[poll] clip saved for render ${renderId} url: ${result.url}`)
          savedRenderIds.push(renderId)
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
        savedRenderIds,
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
        savedRenderIds,
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
