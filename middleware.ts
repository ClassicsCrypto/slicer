import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/api/jobs',
  '/api/process',
  '/api/clips',
  '/api/caption',
  '/api/usage',
  '/api/autoclip',
]

function authBypassed() {
  return process.env.SKIP_AUTH === 'true' || process.env.NEXT_PUBLIC_SKIP_AUTH === 'true'
}

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function middleware(req: NextRequest) {
  if (authBypassed()) return NextResponse.next()
  if (!isProtectedPath(req.nextUrl.pathname)) return NextResponse.next()

  const hasSession = req.cookies.has('slicer_session')
  if (hasSession) return NextResponse.next()

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const loginUrl = new URL('/', req.url)
  loginUrl.searchParams.set('next', req.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
