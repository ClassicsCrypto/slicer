import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { uploadToStorage } from '@/lib/storage'
import { v4 as uuidv4 } from 'uuid'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

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
  const user = { id: userId }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  }

  if (file.size > 2 * 1024 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 2GB)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'mp4'
  const storageKey = `uploads/${user.id}/${uuidv4()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  await uploadToStorage(storageKey, buffer, file.type)

  return NextResponse.json({
    r2Key: storageKey, // keep field name for API compatibility
    filename: file.name,
    size: file.size,
    contentType: file.type,
  })
}
