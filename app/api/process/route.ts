import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderClip } from '@/lib/shotstack'
import { v4 as uuidv4 } from 'uuid'
import type { ProcessingOptions, AIFocus } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CLIP_MODE = process.env.CLIP_MODE || (process.env.SHOTSTACK_API_KEY ? 'shotstack' : 'instant')
const ASSEMBLYAI_API = 'https://api.assemblyai.com/v2'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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

/**
 * Submit AssemblyAI transcription — fire and forget, don't wait.
 * Returns the transcript ID for polling later.
 */
async function submitTranscription(videoUrl: string): Promise<string | null> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(`${ASSEMBLYAI_API}/transcript`, {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: videoUrl,
        auto_highlights: true,
        auto_chapters: true,
      }),
    })
    if (!res.ok) {
      console.error('[process] AssemblyAI submit failed:', res.status)
      return null
    }
    const { id } = await res.json()
    console.log(`[process] AssemblyAI transcript submitted: ${id}`)
    return id
  } catch (err) {
    console.error('[process] AssemblyAI submit error:', err)
    return null
  }
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()

  const body = await req.json()
  const { videoUrl, filePath, publicUrl, options, title, userId: bodyUserId } = body as {
    videoUrl?: string; filePath?: string; publicUrl?: string
    options: ProcessingOptions; title?: string; userId?: string
  }

  // Resolve userId
  let userId = bodyUserId || 'dev-user'
  if (userId === 'dev-user') {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    if (token.length > 10) {
      try {
        const { data: { user } } = await supabase.auth.getUser(token)
        if (user) userId = user.id
      } catch {}
    }
  }
  if (userId === 'dev-user' && process.env.SKIP_AUTH === 'true' && process.env.DEV_USER_ID) {
    userId = process.env.DEV_USER_ID
  }
  if (userId === 'dev-user') userId = uuidv4()

  if (!videoUrl && !filePath) {
    return NextResponse.json({ error: 'No video source provided' }, { status: 400 })
  }

  const sourceUrl = publicUrl || (videoUrl?.startsWith('http') ? videoUrl : '')
  if (!sourceUrl) {
    return NextResponse.json({ error: 'Please provide a direct video URL.' }, { status: 400 })
  }

  const jobId = uuidv4()
  const jobTitle = title || (videoUrl
    ? new URL(videoUrl).pathname.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Video'
    : 'Untitled')

  const clipCount = Math.min(options.clipCount || 3, 10)
  const clipDuration = Math.min(parseInt(options.clipLength as string) || 30, 60)

  // Submit AssemblyAI transcription (non-blocking)
  const transcriptId = await submitTranscription(sourceUrl)

  // --- INSTANT MODE: AI picks timestamps, clips use source URL segments ---
  if (CLIP_MODE === 'instant') {
    // If we got a transcriptId, the poll route will check for AI highlights
    // Otherwise fall back to sequential immediately
    if (transcriptId) {
      // Create job in "analyzing" state — poll will complete it when AI is done
      const { error } = await supabase.from('jobs').insert({
        id: jobId,
        user_id: userId,
        title: jobTitle,
        source_url: sourceUrl,
        r2_key: filePath || null,
        status: 'processing',
        options,
        progress: {
          phase: 'analyzing',
          transcriptId,
          sourceUrl,
          clipCount,
          clipDuration,
          aiFocus: options.aiFocus || [],
          estimatedSecondsRemaining: 30,
        },
      })
      if (error) {
        console.error('[process] insert error:', error)
        return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
      }
      console.log(`[process] AI job ${jobId} — transcription submitted, poll will complete`)
      return NextResponse.json({ jobId })
    }

    // No AssemblyAI — sequential fallback (instant)
    const completedClips = buildSequentialClips(jobId, sourceUrl, clipCount, clipDuration, options.aiFocus || [])
    const { error } = await supabase.from('jobs').insert({
      id: jobId, user_id: userId, title: jobTitle, source_url: sourceUrl,
      r2_key: filePath || null, status: 'complete', options,
      progress: {
        phase: 'complete',
        completedClips,
        completedCount: clipCount,
        estimatedSecondsRemaining: 0,
      },
    })
    if (error) {
      console.error('[process] insert error:', error)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }
    console.log(`[process] INSTANT sequential job ${jobId} — ${clipCount} clips`)
    return NextResponse.json({ jobId })
  }

  // --- SHOTSTACK MODE ---
  const { error: insertError } = await supabase.from('jobs').insert({
    id: jobId, user_id: userId, title: jobTitle, source_url: sourceUrl,
    r2_key: filePath || null, status: 'processing', options,
    progress: {
      phase: transcriptId ? 'analyzing' : 'rendering',
      transcriptId,
      sourceUrl,
      clipCount,
      clipDuration,
      aiFocus: options.aiFocus || [],
      rendering: true, renderIds: [],
      estimatedSecondsRemaining: 120,
    },
  })
  if (insertError) {
    console.error('[process] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }

  console.log(`[process] job ${jobId} created`)

  // Submit Shotstack renders (sequential placement for now, poll may update with AI timestamps)
  const renderIds: string[] = []
  for (let i = 0; i < clipCount; i++) {
    const startTime = i * Math.ceil(clipDuration / 2)
    const endTime = startTime + clipDuration
    try {
      const renderId = await renderClip({
        sourceUrl, startTime, endTime,
        outputFormat: 'mp4', outputQuality: options.outputQuality, platformFormat: options.platformFormat,
      })
      renderIds.push(renderId)
      await supabase.from('jobs').update({
        progress: {
          phase: 'rendering', transcriptId, sourceUrl, clipCount, clipDuration,
          aiFocus: options.aiFocus || [],
          rendering: true, renderIds: [...renderIds],
          estimatedSecondsRemaining: 90,
        },
      }).eq('id', jobId)
      console.log(`[process] render ${i + 1}/${clipCount}: ${renderId}`)
    } catch (err) {
      console.error(`[process] render ${i} failed:`, err)
    }
  }

  return NextResponse.json({ jobId })
}

function buildSequentialClips(jobId: string, sourceUrl: string, clipCount: number, clipDuration: number, aiFocus: AIFocus[]) {
  return Array.from({ length: clipCount }, (_, i) => {
    const startTime = i * Math.ceil(clipDuration / 2)
    return {
      id: uuidv4(), job_id: jobId, render_id: `instant-${i}`,
      r2_key: `${sourceUrl}#t=${startTime},${startTime + clipDuration}`,
      duration: clipDuration, start_time: startTime, end_time: startTime + clipDuration,
      matched_categories: assignCategoriesForClip(aiFocus, i),
      ai_reason: 'Sequential clip placement',
      created_at: new Date().toISOString(),
    }
  })
}
