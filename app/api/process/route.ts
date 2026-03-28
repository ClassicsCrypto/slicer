import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderClip } from '@/lib/shotstack'
import { v4 as uuidv4 } from 'uuid'
import type { ProcessingOptions, AIFocus } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SHOTSTACK_ENABLED = !!process.env.SHOTSTACK_API_KEY

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Distribute selected categories across clips so each clip gets a subset.
 */
function assignCategoriesForClip(aiFocus: AIFocus[], clipIndex: number): AIFocus[] {
  if (!aiFocus || aiFocus.length === 0) return []
  if (aiFocus.length === 1) return aiFocus
  const shuffled = [...aiFocus].sort((a, b) =>
    ((a.charCodeAt(0) + clipIndex * 7) % 17) - ((b.charCodeAt(0) + clipIndex * 5) % 13)
  )
  const count = Math.max(1, Math.ceil(aiFocus.length * (0.4 + (clipIndex % 3) * 0.2)))
  return shuffled.slice(0, count)
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase()

  // --- Resolve userId ---
  const body = await req.json()
  const { videoUrl, filePath, publicUrl, options, title, userId: bodyUserId } = body as {
    videoUrl?: string
    filePath?: string
    publicUrl?: string
    options: ProcessingOptions
    title?: string
    userId?: string
  }

  // Priority: body userId (from frontend) > auth token > env fallback > generated
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

  if (userId === 'dev-user') {
    userId = uuidv4()
    console.warn('[process] generated ephemeral userId:', userId)
  }

  // --- Validate input ---
  if (!videoUrl && !filePath) {
    return NextResponse.json({ error: 'No video source provided' }, { status: 400 })
  }

  const sourceUrl = publicUrl || (videoUrl?.startsWith('http') ? videoUrl : '')

  if (SHOTSTACK_ENABLED && !sourceUrl) {
    return NextResponse.json({
      error: 'Please upload a video file directly — YouTube/Twitch URLs are not supported yet.'
    }, { status: 400 })
  }

  // --- Create job ---
  const jobId = uuidv4()
  const jobTitle = title || (videoUrl
    ? new URL(videoUrl).pathname.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Video'
    : 'Untitled')

  const { error: insertError } = await supabase.from('jobs').insert({
    id: jobId,
    user_id: userId,
    title: jobTitle,
    source_url: sourceUrl || videoUrl || null,
    r2_key: filePath || null,
    status: 'processing',
    options,
    progress: {
      uploading: 'done',
      analyzing: 'done',
      detecting: 'done',
      rendering: true,
      renderIds: [],
      estimatedSecondsRemaining: 120,
    },
  })

  if (insertError) {
    console.error('[process] job insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }

  console.log(`[process] job ${jobId} created for user ${userId}`)

  // --- Submit Shotstack renders ---
  if (SHOTSTACK_ENABLED && sourceUrl) {
    const clipCount = Math.min(options.clipCount || 3, 10)
    const clipDuration = Math.min(parseInt(options.clipLength as string) || 30, 60)
    const renderIds: string[] = []

    // Assign categories per clip
    const clipCategories = Array.from({ length: clipCount }, (_, i) =>
      assignCategoriesForClip(options.aiFocus || [], i)
    )
    const clipReasons = Array.from({ length: clipCount }, () => 'Sequential clip placement')

    for (let i = 0; i < clipCount; i++) {
      const startTime = i * Math.ceil(clipDuration / 2)
      const endTime = startTime + clipDuration

      try {
        const renderId = await renderClip({
          sourceUrl,
          startTime,
          endTime,
          outputFormat: 'mp4',
          outputQuality: options.outputQuality,
          platformFormat: options.platformFormat,
        })
        renderIds.push(renderId)

        // Save renderIds incrementally — survives Vercel timeout
        await supabase.from('jobs').update({
          progress: {
            uploading: 'done',
            analyzing: 'done',
            detecting: 'done',
            rendering: true,
            renderIds: [...renderIds],
            clipCategories,
            clipReasons,
            estimatedSecondsRemaining: 90,
          },
        }).eq('id', jobId)

        console.log(`[process] render ${i + 1}/${clipCount} submitted: ${renderId}`)
      } catch (err) {
        console.error(`[process] render ${i} failed:`, err)
      }
    }
  }

  return NextResponse.json({ jobId })
}
