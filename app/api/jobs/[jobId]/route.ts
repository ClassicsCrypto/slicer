import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getUserId(req: NextRequest): string | null {
  const url = new URL(req.url)
  const queryUserId = url.searchParams.get('userId')
  if (queryUserId) return queryUserId
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabase()
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*, clips(*)')
    .eq('id', params.jobId)
    .eq('user_id', userId)
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
  const supabase = getSupabase()
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get job to find storage keys
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('*, clips(*)')
    .eq('id', params.jobId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !job) {
    console.error('[jobs/DELETE] Job fetch failed:', fetchError?.message || 'not found')
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Delete files from Supabase Storage (ignore errors — files may not exist)
  const keysToDelete: string[] = []
  if (job.r2_key && !job.r2_key.startsWith('pending/') && !job.r2_key.startsWith('http')) {
    keysToDelete.push(job.r2_key)
  }
  if (job.clips) {
    for (const clip of job.clips) {
      if (clip.r2_key && !clip.r2_key.startsWith('http')) {
        keysToDelete.push(clip.r2_key)
      }
    }
  }

  if (keysToDelete.length > 0) {
    await supabase.storage.from('slicer-videos').remove(keysToDelete)
  }

  await supabase.from('clips').delete().eq('job_id', params.jobId)

  const { error: deleteError } = await supabase
    .from('jobs')
    .delete()
    .eq('id', params.jobId)
    .eq('user_id', userId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
