export interface TwitchStreamOrVod {
  id: string
  url: string
  title: string
  type: 'live' | 'vod'
  startedAt?: string
  publishedAt?: string
}

let cachedToken: { token: string; expiresAt: number } | null = null

async function getTwitchAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID
  const clientSecret = process.env.TWITCH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required for Twitch polling')
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!response.ok) {
    throw new Error(`Twitch token failed: ${response.status} ${await response.text()}`)
  }

  const payload = await response.json()
  cachedToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 3600) - 30) * 1000,
  }
  return cachedToken.token
}

async function twitchFetch(path: string) {
  const clientId = process.env.TWITCH_CLIENT_ID
  const token = await getTwitchAppToken()
  const response = await fetch(`https://api.twitch.tv/helix${path}`, {
    headers: {
      'Client-ID': clientId!,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) throw new Error(`Twitch API failed: ${response.status} ${await response.text()}`)
  return response.json()
}

function normalizeHandle(handleOrUrl: string) {
  const value = String(handleOrUrl || '').trim().replace(/^@/, '')
  if (!value) return ''
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[0] || ''
  } catch {
    return value.split('/').filter(Boolean).pop() || value
  }
}

export async function findLatestTwitchSource(handleOrUrl: string, mode: 'vod' | 'live' = 'vod'): Promise<TwitchStreamOrVod | null> {
  const login = normalizeHandle(handleOrUrl).toLowerCase()
  if (!login) throw new Error('Missing Twitch handle')

  if (mode === 'live') {
    const streams = await twitchFetch(`/streams?user_login=${encodeURIComponent(login)}&first=1`)
    const stream = streams.data?.[0]
    if (!stream) return null
    return {
      id: `live:${stream.id}`,
      url: `https://www.twitch.tv/${login}`,
      title: stream.title || `${login} live stream`,
      type: 'live',
      startedAt: stream.started_at,
    }
  }

  const users = await twitchFetch(`/users?login=${encodeURIComponent(login)}`)
  const user = users.data?.[0]
  if (!user?.id) return null

  const videos = await twitchFetch(`/videos?user_id=${encodeURIComponent(user.id)}&type=archive&first=5`)
  const vod = (videos.data || [])
    .filter((item: any) => item?.id && item?.url)
    .sort((a: any, b: any) => new Date(b.published_at || b.created_at || 0).getTime() - new Date(a.published_at || a.created_at || 0).getTime())[0]

  if (!vod) return null
  return {
    id: `vod:${vod.id}`,
    url: vod.url || `https://www.twitch.tv/videos/${vod.id}`,
    title: vod.title || `${login} Twitch VOD`,
    type: 'vod',
    publishedAt: vod.published_at || vod.created_at,
  }
}
