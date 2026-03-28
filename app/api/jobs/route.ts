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
  const userId = new URL(req.url).searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Single query — clips are embedded in job.progress.completedClips
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[jobs/GET] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Map completedClips from progress into the clips field the frontend expects
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
