import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { uploadToStorage } from '@/lib/storage'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

// Increase body size limit for video uploads
export const config = {
  api: {
    bodyParser: false,
  },
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseAdmin()
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  let userId = 'dev-user'
  if (token) {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  } else if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Supported: MP4, MOV, AVI, WebM, MKV' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() || 'mp4'
    const storageKey = `uploads/${userId}/${uuidv4()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    await uploadToStorage(storageKey, buffer, file.type)

    // Get public URL
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: urlData } = client.storage.from('slicer-videos').getPublicUrl(storageKey)

    return NextResponse.json({
      r2Key: storageKey,
      publicUrl: urlData.publicUrl,
      filename: file.name,
      size: file.size,
      contentType: file.type,
    })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error') }, { status: 500 })
  }
}
