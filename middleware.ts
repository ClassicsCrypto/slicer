import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  // Skip auth if SKIP_AUTH is set to 'true'
  if (process.env.SKIP_AUTH === 'true') {
    return NextResponse.next()
  }

  // Only protect /dashboard
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    // Check for session cookie (Supabase sets sb-access-token or similar)
    const hasSession =
      req.cookies.has('sb-access-token') ||
      req.cookies.has('supabase-auth-token') ||
      !!process.env.NEXT_PUBLIC_DEV_USER_ID

    if (!hasSession) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
