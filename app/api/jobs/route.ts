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

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*, clips(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(jobs)
}
