import { NextRequest, NextResponse } from 'next/server'
import { createEmailLoginCode } from '@/lib/auth'
import { sendEmailLoginCode } from '@/lib/email-login'

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

  try {
    const delivery = await sendEmailLoginCode({ to: email, code, expiresAt })

    if (delivery.delivered) {
      return NextResponse.json({
        ok: true,
        expiresAt,
        delivery: delivery.provider,
      })
    }

    // Development/stable fallback until MCV provides a verified sender and API key.
    console.info(`[slicer-auth] Email login code for ${email}: ${code}`)
    return NextResponse.json({
      ok: true,
      expiresAt,
      devCode: code,
      delivery: 'debug',
      deliveryReason: delivery.reason,
    })
  } catch (error) {
    console.error('[slicer-auth] Email login delivery failed', error)
    return NextResponse.json({ error: 'Could not send login code. Please try again.' }, { status: 502 })
  }
}
