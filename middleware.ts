import { NextRequest, NextResponse } from 'next/server'

export async function middleware(req: NextRequest) {
  // Let all requests through — auth is handled client-side
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/dashboard/:path*'],
}
