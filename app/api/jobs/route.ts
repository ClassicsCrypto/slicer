import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Accept userId from query param (avoids REQUEST_HEADER_TOO_LARGE)
  const url = new URL(req.url)
  const queryUserId = url.searchParams.get('userId')

  // Also try auth header as fallback
  let userId: string | null = queryUserId
  if (!userId) {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') || ''
    if (token.length > 10) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError) {
          console.error('[jobs/GET] Auth error:', authError.message)
        }
        userId = user?.id || null
      } catch (err) {
        console.error('[jobs/GET] Auth token validation failed:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  // DEV MODE bypass — only if a valid DEV_USER_ID is configured
  if (!userId && process.env.SKIP_AUTH === 'true' && process.env.DEV_USER_ID) {
    userId = process.env.DEV_USER_ID
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }


  // Fetch jobs without nested clips join (join was causing filter to return 0)
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  console.log(`[jobs/GET] userId: ${userId} jobs: ${jobs?.length ?? 0}`)

  if (error) {
    console.error('[jobs/GET] DB error:', error.message, 'userId:', userId)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch ALL clips in one query, then group by job_id in JS
  // (avoids PostgREST .eq() filter bug on UUID columns)
  const { data: allClips, error: allClipsError } = await supabase
    .from('clips')
    .select('*')
    .in('job_id', (jobs || []).map(j => j.id))
  console.log(`[jobs/GET] clips: ${allClips?.length ?? 0} jobIds: ${(jobs || []).map(j => j.id).join(',')}`)
  if (allClipsError) console.error('[jobs/GET] clips fetch error:', allClipsError.message)

  const clipsByJob = new Map<string, typeof allClips>()
  for (const clip of allClips || []) {
    const key = String(clip.job_id)
    if (!clipsByJob.has(key)) clipsByJob.set(key, [])
    clipsByJob.get(key)!.push(clip)
  }

  const jobsWithClips = (jobs || []).map(job => ({
    ...job,
    clips: clipsByJob.get(String(job.id)) || [],
  }))

  return NextResponse.json(jobsWithClips, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    }
  })
}
