import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRenderStatus } from '@/lib/shotstack'
import { v4 as uuidv4 } from 'uuid'
import type { AIFocus } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ASSEMBLYAI_API = 'https://api.assemblyai.com/v2'
const CLIP_MODE = process.env.CLIP_MODE || (process.env.SHOTSTACK_API_KEY ? 'shotstack' : 'instant')

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Check AssemblyAI transcript status and return highlights if done.
 */
async function checkTranscript(transcriptId: string): Promise<{
  status: 'processing' | 'completed' | 'error'
  highlights?: { text: string; rank: number; timestamps: { start: number; end: number }[] }[]
  chapters?: { start: number; end: number; summary: string; headline: string }[]
  text?: string
}> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) return { status: 'error' }

  const res = await fetch(`${ASSEMBLYAI_API}/transcript/${transcriptId}`, {
    headers: { 'Authorization': apiKey },
  })
  if (!res.ok) return { status: 'processing' }

  const data = await res.json()
  if (data.status === 'completed') {
    return {
      status: 'completed',
      highlights: data.auto_highlights?.results || [],
      chapters: data.chapters || [],
      text: data.text || '',
    }
  }
  if (data.status === 'error') return { status: 'error' }
  return { status: 'processing' }
}

/**
 * Pick the best clip timestamps from AI highlights + chapters.
 * Highlights = key phrases ranked by importance.
 * Chapters = auto-detected topic segments with summaries.
 */
function pickSmartTimestamps(
  highlights: { text: string; rank: number; timestamps: { start: number; end: number }[] }[],
  chapters: { start: number; end: number; summary: string; headline: string }[],
  clipCount: number,
  clipDuration: number,
  aiFocus: AIFocus[]
): { startTime: number; reason: string; categories: AIFocus[] }[] {
  const candidates: { startTime: number; score: number; reason: string }[] = []

  // Score from highlights (higher rank = better)
  for (const h of highlights) {
    for (const ts of h.timestamps) {
      const startSec = Math.max(0, ts.start / 1000 - 2) // start 2s before highlight
      candidates.push({
        startTime: startSec,
        score: h.rank * 100,
        reason: `"${h.text}" (highlight, rank ${h.rank.toFixed(2)})`,
      })
    }
  }

  // Score from chapters (topic boundaries are good cut points)
  for (const ch of chapters) {
    const startSec = ch.start / 1000
    candidates.push({
      startTime: startSec,
      score: 50, // chapters get baseline score
      reason: ch.headline || ch.summary || 'Chapter boundary',
    })
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Deduplicate — no overlapping clips
  const selected: typeof candidates = []
  for (const c of candidates) {
    if (selected.length >= clipCount) break
    const overlaps = selected.some(s => Math.abs(s.startTime - c.startTime) < clipDuration * 0.8)
    if (!overlaps) selected.push(c)
  }

  // Pad with sequential if not enough highlights
  let nextStart = selected.length > 0
    ? Math.max(...selected.map(s => s.startTime)) + clipDuration + 5
    : 0
  while (selected.length < clipCount) {
    selected.push({ startTime: nextStart, score: 0, reason: 'Sequential fallback' })
    nextStart += Math.ceil(clipDuration / 2)
  }

  // Sort chronologically and assign categories
  return selected
    .slice(0, clipCount)
    .sort((a, b) => a.startTime - b.startTime)
    .map((s, i) => ({
      startTime: Math.max(0, Math.round(s.startTime)),
      reason: s.reason,
      categories: assignCategoriesForClip(aiFocus, i),
    }))
}

function assignCategoriesForClip(aiFocus: AIFocus[], clipIndex: number): AIFocus[] {
  if (!aiFocus || aiFocus.length === 0) return []
  if (aiFocus.length === 1) return aiFocus
  const shuffled = [...aiFocus].sort((a, b) =>
    ((a.charCodeAt(0) + clipIndex * 7) % 17) - ((b.charCodeAt(0) + clipIndex * 5) % 13)
  )
  const count = Math.max(1, Math.ceil(aiFocus.length * (0.4 + (clipIndex % 3) * 0.2)))
  return shuffled.slice(0, count)
}

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabase()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Already done
  if (job.status === 'complete' || job.status === 'failed') {
    return NextResponse.json({ ...job, clips: job.progress?.completedClips || [] })
  }

  const progress = job.progress || {}
  const transcriptId = progress.transcriptId as string | undefined
  const sourceUrl = progress.sourceUrl as string || job.source_url
  const clipCount = (progress.clipCount as number) || 3
  const clipDuration = (progress.clipDuration as number) || 30
  const aiFocus = (progress.aiFocus as AIFocus[]) || []

  // --- PHASE 1: Check if AI analysis is done ---
  if (progress.phase === 'analyzing' && transcriptId) {
    console.log(`[poll] checking AssemblyAI transcript ${transcriptId}`)
    const result = await checkTranscript(transcriptId)

    if (result.status === 'completed') {
      console.log(`[poll] AI done: ${result.highlights?.length || 0} highlights, ${result.chapters?.length || 0} chapters`)

      const smartPicks = pickSmartTimestamps(
        result.highlights || [], result.chapters || [],
        clipCount, clipDuration, aiFocus
      )

      if (CLIP_MODE === 'instant') {
        // Create clips immediately with AI-picked timestamps
        const completedClips = smartPicks.map((pick, i) => ({
          id: uuidv4(),
          job_id: params.jobId,
          render_id: `ai-${i}`,
          r2_key: `${sourceUrl}#t=${pick.startTime},${pick.startTime + clipDuration}`,
          duration: clipDuration,
          start_time: pick.startTime,
          end_time: pick.startTime + clipDuration,
          matched_categories: pick.categories,
          ai_reason: pick.reason,
          created_at: new Date().toISOString(),
        }))

        await supabase.from('jobs').update({
          status: 'complete',
          progress: {
            ...progress,
            phase: 'complete',
            completedClips,
            completedCount: completedClips.length,
            aiHighlightsCount: result.highlights?.length || 0,
            aiChaptersCount: result.chapters?.length || 0,
            transcriptText: result.text?.slice(0, 500),
            estimatedSecondsRemaining: 0,
          },
        }).eq('id', params.jobId)

        console.log(`[poll] AI clips created: ${completedClips.map(c => `${c.start_time}s`).join(', ')}`)
        return NextResponse.json({
          ...job, status: 'complete',
          clips: completedClips,
          progress: { ...progress, phase: 'complete', completedClips, completedCount: completedClips.length },
        })
      }

      // Shotstack mode: update progress with AI picks, renderIds will be set later
      await supabase.from('jobs').update({
        progress: { ...progress, phase: 'rendering', aiPicks: smartPicks, estimatedSecondsRemaining: 90 },
      }).eq('id', params.jobId)

      return NextResponse.json({
        ...job, status: 'processing',
        clips: [],
        progress: { ...progress, phase: 'rendering', estimatedSecondsRemaining: 90 },
      })
    }

    if (result.status === 'error') {
      console.error('[poll] AssemblyAI error — falling back to sequential')
      // Fall through to sequential fallback
      if (CLIP_MODE === 'instant') {
        const completedClips = Array.from({ length: clipCount }, (_, i) => {
          const st = i * Math.ceil(clipDuration / 2)
          return {
            id: uuidv4(), job_id: params.jobId, render_id: `seq-${i}`,
            r2_key: `${sourceUrl}#t=${st},${st + clipDuration}`,
            duration: clipDuration, start_time: st, end_time: st + clipDuration,
            matched_categories: assignCategoriesForClip(aiFocus, i),
            ai_reason: 'Sequential fallback (AI error)',
            created_at: new Date().toISOString(),
          }
        })
        await supabase.from('jobs').update({
          status: 'complete',
          progress: { ...progress, phase: 'complete', completedClips, completedCount: clipCount, estimatedSecondsRemaining: 0 },
        }).eq('id', params.jobId)
        return NextResponse.json({ ...job, status: 'complete', clips: completedClips })
      }
    }

    // Still processing — check timeout (5 min max for AssemblyAI)
    const jobAge = Date.now() - new Date(job.created_at).getTime()
    if (jobAge > 300000) {
      console.warn('[poll] AssemblyAI timeout after 5min — sequential fallback')
      if (CLIP_MODE === 'instant') {
        const completedClips = Array.from({ length: clipCount }, (_, i) => {
          const st = i * Math.ceil(clipDuration / 2)
          return {
            id: uuidv4(), job_id: params.jobId, render_id: `timeout-${i}`,
            r2_key: `${sourceUrl}#t=${st},${st + clipDuration}`,
            duration: clipDuration, start_time: st, end_time: st + clipDuration,
            matched_categories: assignCategoriesForClip(aiFocus, i),
            ai_reason: 'Sequential fallback (AI timeout)',
            created_at: new Date().toISOString(),
          }
        })
        await supabase.from('jobs').update({
          status: 'complete',
          progress: { ...progress, phase: 'complete', completedClips, completedCount: clipCount, estimatedSecondsRemaining: 0 },
        }).eq('id', params.jobId)
        return NextResponse.json({ ...job, status: 'complete', clips: completedClips })
      }
    }

    // Still waiting for AI
    console.log(`[poll] AI still processing (${Math.round(jobAge / 1000)}s)`)
    return NextResponse.json({
      ...job, clips: [],
      progress: { ...progress, phase: 'analyzing', estimatedSecondsRemaining: Math.max(10, 30 - Math.round(jobAge / 1000)) },
    })
  }

  // --- PHASE 2: Check Shotstack renders ---
  const renderIds: string[] = progress.renderIds || []
  if (!renderIds.length) {
    return NextResponse.json({ ...job, clips: [] })
  }

  const completedClips = [...(progress.completedClips || [])]
  const savedRenderIds = completedClips.map((c: { render_id: string }) => c.render_id)
  let allDone = true

  for (let i = 0; i < renderIds.length; i++) {
    const renderId = renderIds[i]
    if (savedRenderIds.includes(renderId)) continue
    try {
      const result = await getRenderStatus(renderId)
      if (result.status === 'done' && result.url) {
        const startTime = i * Math.ceil(clipDuration / 2)
        completedClips.push({
          id: uuidv4(), job_id: params.jobId, render_id: renderId,
          r2_key: result.url, duration: clipDuration,
          start_time: startTime, end_time: startTime + clipDuration,
          matched_categories: assignCategoriesForClip(aiFocus, i),
          ai_reason: progress.clipReasons?.[i] || 'Rendered clip',
          created_at: new Date().toISOString(),
        })
      } else if (result.status !== 'failed') {
        allDone = false
      }
    } catch {
      allDone = false
    }
  }

  const done = allDone || completedClips.length === renderIds.length
  await supabase.from('jobs').update({
    status: done ? 'complete' : 'processing',
    progress: {
      ...progress, phase: done ? 'complete' : 'rendering',
      completedClips, completedCount: completedClips.length,
      estimatedSecondsRemaining: done ? 0 : (renderIds.length - completedClips.length) * 30,
    },
  }).eq('id', params.jobId)

  return NextResponse.json({
    ...job,
    status: done ? 'complete' : 'processing',
    clips: completedClips,
    progress: { ...progress, completedClips, completedCount: completedClips.length },
  })
}
