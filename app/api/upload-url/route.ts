import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function randomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await req.json()
    const { filename = 'video.mp4', contentType = 'video/mp4', userId: bodyUserId } = body

    // Auth: try header token first, fall back to userId in body
    let userId = 'dev-user'
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '').trim()

    if (token && token.length > 10) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token)
        if (!error && user) userId = user.id
      } catch (err) {
        console.error('[upload-url/POST] Auth token validation failed:', err instanceof Error ? err.message : String(err))
      }
    }

    if (userId === 'dev-user' && bodyUserId) {
      userId = bodyUserId
    }

    if (userId === 'dev-user' && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ext = filename.split('.').pop() || 'mp4'
    const storageKey = `uploads/${userId}/${randomId()}.${ext}`

    const { data, error } = await supabase.storage
      .from('slicer-videos')
      .createSignedUploadUrl(storageKey)

    if (error || !data) {
      return NextResponse.json({ error: `Storage error: ${error?.message}` }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('slicer-videos').getPublicUrl(storageKey)

    return NextResponse.json({
      signedUrl: data.signedUrl,
      storageKey,
      publicUrl: urlData.publicUrl,
    })
  } catch (err) {
    console.error('upload-url crash:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
