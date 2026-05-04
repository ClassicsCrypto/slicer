import { NextRequest, NextResponse } from 'next/server'
import { createEmailLoginCode } from '@/lib/auth'

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email || '').trim().toLowerCase()

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const { code, expiresAt } = createEmailLoginCode(email)

  // Delivery hook: wire SMTP/Resend/Postmark here when MCV picks a sender.
  // Until then, this dev/stable preview exposes the code after request so the team can use OTP login now.
  console.info(`[slicer-auth] Email login code for ${email}: ${code}`)

  return NextResponse.json({
    ok: true,
    expiresAt,
    devCode: code,
    delivery: 'debug',
  })
}
