import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { renderClip } from '@/lib/shotstack'
import { v4 as uuidv4 } from 'uuid'
import type { ProcessingOptions } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60s max — just enough to submit renders

const SHOTSTACK_ENABLED = !!process.env.SHOTSTACK_API_KEY

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
    } catch { /* header too large — will use userId from body */ }
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

  // Create job in DB
  if (userId !== 'dev-user') {
    const { error: insertError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        user_id: userId,
        title: title || videoUrl || 'Untitled',
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

    for (let i = 0; i < clipCount; i++) {
      const startTime = i * (clipDuration + 5)
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
        })
        renderIds.push(renderId)
      } catch (err) {
        console.error(`Failed to submit render ${i}:`, err)
      }
    }

    // Save render IDs to job so polling endpoint can check them
    if (userId !== 'dev-user' && renderIds.length > 0) {
      await supabase.from('jobs').update({
        progress: {
          uploading: 'done',
          analyzing: 'done',
          detecting: 'done',
          subtitles: 'done',
          rendering: true,
          renderIds,
          estimatedSecondsRemaining: 90,
        }
      }).eq('id', jobId)
    }
  }

  return NextResponse.json({ jobId })
}
