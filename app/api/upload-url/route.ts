/**
 * Returns a signed upload URL so the browser can upload directly to
 * Supabase Storage, bypassing Vercel's 4.5MB body size limit entirely.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  let userId = 'dev-user'
  if (token) {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
  } else if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { filename, contentType } = await req.json()
  const ext = filename?.split('.').pop() || 'mp4'
  const storageKey = `uploads/${userId}/${uuidv4()}.${ext}`

  // Create a signed upload URL valid for 10 minutes
  const { data, error } = await supabase.storage
    .from('slicer-videos')
    .createSignedUploadUrl(storageKey)

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
  }

  // Get the public URL for after upload completes
  const { data: urlData } = supabase.storage
    .from('slicer-videos')
    .getPublicUrl(storageKey)

  return NextResponse.json({
    signedUrl: data.signedUrl,
    storageKey,
    publicUrl: urlData.publicUrl,
  })
}
