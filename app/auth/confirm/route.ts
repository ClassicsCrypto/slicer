import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/dashboard'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as 'email' | 'recovery' | 'invite' | 'email_change',
    })
    if (!error) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    console.error('OTP verify error:', error.message)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    console.error('Code exchange error:', error.message)
  }

  // Fallback — redirect to home with error
  return NextResponse.redirect(new URL('/?error=auth_failed', req.url))
}
