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

function isTrustedInternalRequest(req: NextRequest) {
  const secret = process.env.AUTOCLIP_POLL_SECRET || process.env.SLICER_INTERNAL_TOKEN || process.env.CRON_SECRET || ''
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true

  const host = req.nextUrl.hostname.toLowerCase()
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  return isLocalHost && req.headers.get('x-slicer-local-poller') === '1'
}

function noStoreDashboardResponse() {
  const response = NextResponse.next()
  response.headers.set('cache-control', 'no-store, max-age=0')
  return response
}

export function middleware(req: NextRequest) {
  const isDashboard = req.nextUrl.pathname === '/dashboard' || req.nextUrl.pathname.startsWith('/dashboard/')

  if (authBypassed()) return isDashboard ? noStoreDashboardResponse() : NextResponse.next()
  if (!isProtectedPath(req.nextUrl.pathname)) return NextResponse.next()
  if (isTrustedInternalRequest(req)) return NextResponse.next()

  const hasSession = req.cookies.has('slicer_session')
  if (hasSession) return isDashboard ? noStoreDashboardResponse() : NextResponse.next()

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
