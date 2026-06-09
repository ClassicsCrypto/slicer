import 'server-only'

export type EmailDeliveryResult =
  | { provider: 'debug'; delivered: false; reason: string }
  | { provider: 'resend'; delivered: true; id?: string }

type SendLoginCodeInput = {
  to: string
  code: string
  expiresAt: string
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}` || 'https://slicer.marscatsvoyage.com'
}

function getFromAddress() {
  return process.env.AUTH_EMAIL_FROM || process.env.EMAIL_FROM || 'Slicer <login@marscatsvoyage.com>'
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderText(code: string, expiresAt: string) {
  const expiry = new Date(expiresAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  return [
    `Your Slicer login code is: ${code}`,
    '',
    `It expires at ${expiry}.`,
    '',
    'If you did not request this, you can ignore this email.',
    `Slicer: ${getBaseUrl()}`,
  ].join('\n')
}

function renderHtml(code: string, expiresAt: string) {
  const escapedCode = htmlEscape(code)
  const expiry = htmlEscape(new Date(expiresAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }))

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#111827;line-height:1.5">
      <h1 style="font-size:20px;margin:0 0 12px">Your Slicer login code</h1>
      <p style="margin:0 0 16px">Use this one-time code to sign in:</p>
      <div style="font-size:32px;letter-spacing:6px;font-weight:700;background:#f3f4f6;border-radius:12px;padding:16px 20px;display:inline-block">${escapedCode}</div>
      <p style="margin:16px 0 0;color:#4b5563">This code expires at ${expiry}.</p>
      <p style="margin:16px 0 0;color:#6b7280;font-size:14px">If you did not request this, you can ignore this email.</p>
    </div>
  `
}

export async function sendEmailLoginCode({ to, code, expiresAt }: SendLoginCodeInput): Promise<EmailDeliveryResult> {
  const provider = (process.env.AUTH_EMAIL_PROVIDER || process.env.EMAIL_PROVIDER || '').trim().toLowerCase()
  const resendApiKey = process.env.RESEND_API_KEY?.trim()

  if (provider !== 'resend' || !resendApiKey) {
    return {
      provider: 'debug',
      delivered: false,
      reason: provider ? `${provider} is not configured` : 'AUTH_EMAIL_PROVIDER is not configured',
    }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to,
      subject: 'Your Slicer login code',
      text: renderText(code, expiresAt),
      html: renderHtml(code, expiresAt),
    }),
  })

  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: string }

  if (!response.ok) {
    const detail = payload.message || payload.error || `Resend returned HTTP ${response.status}`
    throw new Error(`Email login delivery failed: ${detail}`)
  }

  return { provider: 'resend', delivered: true, id: payload.id }
}
