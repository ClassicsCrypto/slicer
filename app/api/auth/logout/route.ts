import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, getSessionCookieName, revokeSessionToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  revokeSessionToken(request.cookies.get(getSessionCookieName())?.value)
  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)
  return response
}
