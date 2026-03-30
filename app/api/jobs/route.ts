import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { Clip } from '@/types'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Jobs fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    // Map progress.completedClips → clips field
    const mapped = (jobs ?? []).map((job) => {
      const completedClips = (job.progress?.completedClips ?? []) as Clip[]
      return { ...job, clips: completedClips }
    })

    return NextResponse.json({ jobs: mapped })
  } catch (err) {
    console.error('Jobs route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
