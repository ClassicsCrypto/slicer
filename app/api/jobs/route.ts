import { NextResponse } from 'next/server'
import { Clip } from '@/types'

export const dynamic = 'force-dynamic'

// Bypass Supabase JS client entirely — use REST API directly
async function fetchJobsRaw() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const res = await fetch(`${url}/rest/v1/jobs?order=created_at.desc`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase REST error: ${res.status} ${text}`)
  }

  return res.json()
}

export async function GET() {
  try {
    const jobs = await fetchJobsRaw()

    console.log(`[jobs/GET] REST API returned ${jobs?.length ?? 0} jobs`)

    const mapped = (jobs ?? []).map((job: Record<string, unknown>) => {
      const progress = job.progress as Record<string, unknown> | null
      const completedClips = (progress?.completedClips ?? []) as Clip[]
      return { ...job, clips: completedClips }
    })

    return NextResponse.json({ jobs: mapped }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (err) {
    console.error('Jobs route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
