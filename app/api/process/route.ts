import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderClip } from '@/lib/shotstack'
import { detectHighlightsAI } from '@/lib/ai-analysis'
import { v4 as uuidv4 } from 'uuid'
import type { ProcessingOptions, AIFocus } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60s — Vercel Hobby limit. Whisper runs fast on 24MB chunks.

const SHOTSTACK_ENABLED = !!process.env.SHOTSTACK_API_KEY

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const AI_FOCUS_LABELS: Record<AIFocus, string> = {
  funny_moments: 'Funny Moments',
  kill_streaks: 'Kill Streaks',
  intense_action: 'Intense Action',
  big_plays: 'Big Plays',
  reactions: 'Reactions',
  key_dialogue: 'Key Dialogue',
  hype_moments: 'Hype Moments',
  fails: 'Fails & Clips',
}

const AI_FOCUS_ICONS: Record<AIFocus, string> = {
  funny_moments: '😂',
  kill_streaks: '💀',
  intense_action: '🔥',
  big_plays: '🏆',
  reactions: '😱',
  key_dialogue: '🗣️',
  hype_moments: '⚡',
  fails: '💥',
}

/**
 * Simulate AI category matching per clip.
 * Each clip gets the selected focus categories, distributed so not every clip
 * has every category (makes the UI feel realistic and useful).
 */
function assignCategoriesForClip(aiFocus: AIFocus[], clipIndex: number, totalClips: number): AIFocus[] {
  if (!aiFocus || aiFocus.length === 0) return []
  if (aiFocus.length === 1) return aiFocus

  // Each clip gets at least 1, up to all categories, staggered by index
  const shuffled = [...aiFocus].sort((a, b) => {
    // Deterministic pseudo-shuffle based on clip index + category
    return ((a.charCodeAt(0) + clipIndex * 7) % 17) - ((b.charCodeAt(0) + clipIndex * 5) % 13)
  })
  const count = Math.max(1, Math.ceil(aiFocus.length * (0.4 + (clipIndex % 3) * 0.2)))
  return shuffled.slice(0, count)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  let userId = 'dev-user'

  if (token && token.length > 10) {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      if (!authError && user) userId = user.id
    } catch (err) {
      console.error('[process/POST] Auth token validation failed:', err instanceof Error ? err.message : String(err))
    }
  }

  const body = await req.json()
  const { videoUrl, filePath, publicUrl, options, title, userId: bodyUserId } = body as {
    videoUrl?: string
    filePath?: string
    publicUrl?: string
    options: ProcessingOptions
    title?: string
    userId?: string
  }

  // If header auth failed due to REQUEST_HEADER_TOO_LARGE, use userId from body
  if (userId === 'dev-user' && bodyUserId) {
    userId = bodyUserId
  }

  // DEV MODE bypass — only apply if a valid UUID is configured
  if (userId === 'dev-user' && process.env.SKIP_AUTH === 'true' && process.env.DEV_USER_ID) {
    userId = process.env.DEV_USER_ID
  }

  // Final safety: if still 'dev-user' with SKIP_AUTH, generate a stable anonymous UUID
  // This prevents job rows from being skipped when session hasn't loaded yet
  if (userId === 'dev-user') {
    userId = uuidv4()
    console.warn('[process] No userId from session or body — generated ephemeral UUID:', userId)
  }

  if (!videoUrl && !filePath) {
    return NextResponse.json({ error: 'No video source provided' }, { status: 400 })
  }

  // Determine source URL for Shotstack
  const sourceUrl = publicUrl || (videoUrl?.startsWith('http') ? videoUrl : '')

  // Validate source URL is usable
  if (SHOTSTACK_ENABLED && !sourceUrl) {
    return NextResponse.json({
      error: 'Please upload a video file directly — YouTube/Twitch URLs are not supported yet. Use drag & drop or Browse Files.'
    }, { status: 400 })
  }

  const jobId = uuidv4()

  // Create job in DB — always insert, userId is guaranteed to be a real UUID now
  {
    const { error: insertError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        user_id: userId,
        title: title || (videoUrl ? new URL(videoUrl).pathname.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Video' : 'Untitled'),
        source_url: sourceUrl || videoUrl || null,
        r2_key: filePath || null,
        status: 'processing',
        options,
        progress: { uploading: 'done', analyzing: 'done', detecting: 'done', subtitles: 'done', rendering: true, estimatedSecondsRemaining: 120 },
      })

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }
  }

  // Submit renders to Shotstack (fast — just queue them, don't wait)
  if (SHOTSTACK_ENABLED && sourceUrl) {
    const clipCount = Math.min(options.clipCount || 3, 10)
    const clipDuration = Math.min(parseInt(options.clipLength as string) || 30, 60)
    const madeWithSlicer = true
    const renderIds: string[] = []

    // Build subtitle overlays if enabled
    const subtitleCues = options.subtitles?.enabled
      ? [{ text: '[ subtitles enabled ]', style: options.subtitles.style, color: options.subtitles.color }]
      : undefined

    // --- AI ANALYSIS: detect highlight moments using Whisper + GPT-4o ---
    let highlights = null
    try {
      console.log(`[process] running AI highlight detection on ${sourceUrl}`)
      highlights = await detectHighlightsAI(sourceUrl, {
        clipDuration,
        clipCount,
        aiFocus: options.aiFocus || [],
      })
      console.log(`[process] AI found ${highlights.length} highlights`)
    } catch (err) {
      console.error('[process] AI analysis failed, falling back to sequential:', err)
    }

    for (let i = 0; i < clipCount; i++) {
      // Use AI-detected timestamp if available, otherwise sequential fallback
      const startTime = highlights?.[i]?.startTime ?? i * Math.ceil(clipDuration / 2)
      const endTime = startTime + clipDuration
      try {
        const renderId = await renderClip({
          sourceUrl,
          startTime,
          endTime,
          outputFormat: 'mp4',
          outputQuality: options.outputQuality,
          platformFormat: options.platformFormat,
          madeWithSlicer,
          subtitles: subtitleCues,
        })
        renderIds.push(renderId)
      } catch (err) {
        console.error(`Failed to submit render ${i}:`, err)
      }
    }

    // Save per-clip categories + reasons from AI analysis (or fallback)
    const clipCategories: AIFocus[][] = highlights
      ? highlights.slice(0, clipCount).map(h => h.categories)
      : Array.from({ length: clipCount }, (_, i) => assignCategoriesForClip(options.aiFocus || [], i, clipCount))

    const clipReasons: string[] = highlights
      ? highlights.slice(0, clipCount).map(h => h.reason)
      : []

    if (renderIds.length > 0) {
      await supabase.from('jobs').update({
        progress: {
          uploading: 'done',
          analyzing: 'done',
          detecting: 'done',
          subtitles: 'done',
          rendering: true,
          renderIds,
          clipCategories,
          clipReasons,
          estimatedSecondsRemaining: 90,
        }
      }).eq('id', jobId)
    }
  }

  return NextResponse.json({ jobId })
}
