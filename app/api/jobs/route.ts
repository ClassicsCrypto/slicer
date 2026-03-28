import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()

  // Fetch all jobs — internal tool, no multi-tenancy
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[jobs/GET] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[jobs/GET] found ${jobs?.length ?? 0} jobs`)

  const result = (jobs || []).map(job => ({
    ...job,
    clips: job.progress?.completedClips || [],
  }))

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  })
}
