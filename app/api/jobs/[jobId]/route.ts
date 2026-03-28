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
  return new URL(req.url).searchParams.get('userId')
}

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabase()
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch job by ID only (service role bypasses RLS)
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Verify ownership
  if (job.user_id !== userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Fetch clips with .in() to avoid PostgREST .eq() UUID filter bug
  const { data: jobClips } = await supabase
    .from('clips')
    .select('*')
    .in('job_id', [params.jobId])

  return NextResponse.json({ ...job, clips: jobClips || [] })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabase()
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify job exists and belongs to user
  const { data: job, error: fetchError } = await supabase
    .from('jobs')
    .select('id, user_id, r2_key')
    .eq('id', params.jobId)
    .single()

  if (fetchError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.user_id !== userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // Delete clips first (FK constraint)
  await supabase.from('clips').delete().in('job_id', [params.jobId])

  // Delete job
  const { error: deleteError } = await supabase
    .from('jobs')
    .delete()
    .eq('id', params.jobId)

  if (deleteError) {
    console.error('[jobs/DELETE] error:', deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
