import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabase()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...job,
    clips: job.progress?.completedClips || [],
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = getSupabase()
  const userId = new URL(req.url).searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify ownership
  const { data: job } = await supabase
    .from('jobs')
    .select('id, user_id')
    .eq('id', params.jobId)
    .single()

  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Delete clips first (FK), then job
  await supabase.from('clips').delete().eq('job_id', params.jobId)
  const { error } = await supabase.from('jobs').delete().eq('id', params.jobId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
