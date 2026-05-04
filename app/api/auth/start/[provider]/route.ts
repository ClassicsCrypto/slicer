import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getPublicBaseUrl } from '@/lib/public-url'

const PROVIDERS = ['discord', 'google'] as const

type Provider = (typeof PROVIDERS)[number]

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value)
}

function authUrl(provider: Provider, request: NextRequest, state: string) {
  const origin = getPublicBaseUrl(request.nextUrl)
  const redirectUri = `${origin}/api/auth/callback/${provider}`

  if (provider === 'discord') {
    const clientId = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
    if (!clientId) throw new Error('DISCORD_CLIENT_ID is not configured')
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email',
      state,
    })
    return `https://discord.com/api/oauth2/authorize?${params}`
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  if (!isProvider(params.provider)) {
    return NextResponse.redirect(new URL('/?auth_error=unknown_provider', request.url))
  }

  const state = crypto.randomBytes(24).toString('base64url')
  try {
    const response = NextResponse.redirect(authUrl(params.provider, request, state))
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    response.cookies.set('slicer_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    })
    response.cookies.set('slicer_oauth_provider', params.provider, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 10 * 60,
    })
    return response
  } catch (error: any) {
    const url = new URL('/', request.url)
    url.searchParams.set('auth_error', error?.message ?? 'oauth_not_configured')
    return NextResponse.redirect(url)
  }
}
