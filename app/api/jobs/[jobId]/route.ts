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

  console.log(`[jobs/DELETE] deleting job ${params.jobId}`)

  // Delete clips first (FK constraint)
  const { error: clipsError } = await supabase.from('clips').delete().eq('job_id', params.jobId)
  if (clipsError) console.log(`[jobs/DELETE] clips delete: ${clipsError.message}`)

  // Delete job
  const { error } = await supabase.from('jobs').delete().eq('id', params.jobId)

  if (error) {
    console.error(`[jobs/DELETE] error: ${error.message}`)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[jobs/DELETE] success`)
  return NextResponse.json({ success: true })
}
