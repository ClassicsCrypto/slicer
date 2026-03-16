import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { deleteFromStorage } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createSupabaseAdmin()
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*, clips(*)')
    .eq('id', params.jobId)
    .eq('user_id', user.id)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(job)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createSupabaseAdmin()
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('*, clips(*)')
    .eq('id', params.jobId)
    .eq('user_id', user.id)
    .single()

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Delete files from Supabase Storage
  const keysToDelete: string[] = []
  if (job.r2_key) keysToDelete.push(job.r2_key)
  if (job.clips) {
    for (const clip of job.clips) {
      if (clip.r2_key) keysToDelete.push(clip.r2_key)
      if (clip.thumbnail_r2_key) keysToDelete.push(clip.thumbnail_r2_key)
    }
  }
  await Promise.allSettled(keysToDelete.map((key) => deleteFromStorage(key)))

  await supabase.from('clips').delete().eq('job_id', params.jobId)

  const { error: deleteError } = await supabase
    .from('jobs')
    .delete()
    .eq('id', params.jobId)
    .eq('user_id', user.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
