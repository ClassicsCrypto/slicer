import { NextRequest, NextResponse } from 'next/server'
import { attachSessionCookie, createSession, upsertOAuthUser } from '@/lib/auth'
import { getPublicBaseUrl } from '@/lib/public-url'

const PROVIDERS = ['discord', 'google'] as const

type Provider = (typeof PROVIDERS)[number]

function isProvider(value: string): value is Provider {
  return (PROVIDERS as readonly string[]).includes(value)
}

async function exchangeDiscordCode(code: string, redirectUri: string) {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Discord OAuth is not configured')

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!tokenResponse.ok) throw new Error(`Discord token exchange failed (${tokenResponse.status})`)
  const token = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in?: number }

  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userResponse.ok) throw new Error(`Discord profile fetch failed (${userResponse.status})`)
  const profile = await userResponse.json() as { id: string; username: string; global_name?: string | null; avatar?: string | null; email?: string | null }

  const avatarUrl = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128` : null
  return {
    provider: 'discord' as const,
    providerAccountId: profile.id,
    email: profile.email ?? null,
    displayName: profile.global_name || profile.username || 'Discord User',
    avatarUrl,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
  }
}

async function exchangeGoogleCode(code: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured')

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!tokenResponse.ok) throw new Error(`Google token exchange failed (${tokenResponse.status})`)
  const token = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in?: number }

  const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!userResponse.ok) throw new Error(`Google profile fetch failed (${userResponse.status})`)
  const profile = await userResponse.json() as { sub: string; email?: string; name?: string; picture?: string }

  return {
    provider: 'google' as const,
    providerAccountId: profile.sub,
    email: profile.email ?? null,
    displayName: profile.name || profile.email || 'Google User',
    avatarUrl: profile.picture ?? null,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
  }
}

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const provider = params.provider
  if (!isProvider(provider)) return NextResponse.redirect(new URL('/?auth_error=unknown_provider', request.url))

  const state = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  const savedState = request.cookies.get('slicer_oauth_state')?.value
  const savedProvider = request.cookies.get('slicer_oauth_provider')?.value

  if (!code || !state || state !== savedState || savedProvider !== provider) {
    return NextResponse.redirect(new URL('/?auth_error=invalid_oauth_state', request.url))
  }

  try {
    const redirectUri = `${getPublicBaseUrl(request.nextUrl)}/api/auth/callback/${provider}`
    const account = provider === 'discord'
      ? await exchangeDiscordCode(code, redirectUri)
      : await exchangeGoogleCode(code, redirectUri)

    const { userId, workspaceId } = upsertOAuthUser(account)
    const { token, expiresAt } = createSession(userId, workspaceId)
    const response = NextResponse.redirect(new URL('/dashboard', request.url))
    attachSessionCookie(response, token, expiresAt)
    response.cookies.delete('slicer_oauth_state')
    response.cookies.delete('slicer_oauth_provider')
    return response
  } catch (error: any) {
    const url = new URL('/', request.url)
    url.searchParams.set('auth_error', error?.message ?? 'oauth_callback_failed')
    return NextResponse.redirect(url)
  }
}
