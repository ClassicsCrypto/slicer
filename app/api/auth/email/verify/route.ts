import { NextRequest, NextResponse } from 'next/server'
import { attachSessionCookie, consumeEmailLoginCode, createSession } from '@/lib/auth'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email || '').trim().toLowerCase()
  const code = String(body?.code || '').trim()

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the email and 6-digit code.' }, { status: 400 })
  }

  const account = consumeEmailLoginCode(email, code)
  if (!account) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 })
  }

  const { token, expiresAt } = createSession(account.userId, account.workspaceId)
  const response = NextResponse.json({ ok: true, redirectTo: '/dashboard' })
  attachSessionCookie(response, token, expiresAt)
  return response
}
