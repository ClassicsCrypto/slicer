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

  console.log('[jobs/GET] querying for userId:', userId)
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*, clips(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  console.log('[jobs/GET] result count:', jobs?.length ?? 0, error?.message ?? 'no error')

  if (error) {
    console.error('[jobs/GET] DB error:', error.message, 'userId:', userId)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(jobs, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    }
  })
}
