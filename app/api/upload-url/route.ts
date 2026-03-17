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

    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')

    let userId = 'dev-user'
    if (token && token !== 'test') {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    } else if (!token && process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { filename = 'video.mp4', contentType = 'video/mp4' } = body
    const ext = filename.split('.').pop() || 'mp4'
    const storageKey = `uploads/${userId}/${randomId()}.${ext}`

    const { data, error } = await supabase.storage
      .from('slicer-videos')
      .createSignedUploadUrl(storageKey)

    if (error || !data) {
      console.error('Signed URL error:', error?.message)
      return NextResponse.json({ error: `Storage error: ${error?.message || 'unknown'}` }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('slicer-videos')
      .getPublicUrl(storageKey)

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
