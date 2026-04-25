export interface XVideoSource {
  id: string
  url: string
  title: string
  publishedAt?: string
}

function getBearer() {
  const token = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN
  if (!token) throw new Error('X_BEARER_TOKEN is required for X polling')
  return token
}

async function xFetch(path: string) {
  const response = await fetch(`https://api.twitter.com/2${path}`, {
    headers: { Authorization: `Bearer ${getBearer()}` },
  })
  if (!response.ok) throw new Error(`X API failed: ${response.status} ${await response.text()}`)
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
    return value.split('/').filter(Boolean).pop()?.replace(/^@/, '') || value
  }
}

function extractBroadcastUrl(text: string) {
  const urls = [...String(text || '').matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0])
  return urls.find((url) => /\/i\/broadcasts\//.test(url)) || urls.find((url) => /broadcasts/.test(url)) || null
}

function qualifiesAsStreamPost(text: string) {
  const lower = String(text || '').toLowerCase()
  return /\/i\/broadcasts\//.test(lower)
    || /\b(live|stream|streaming|broadcast|vod|raid|game night|going live)\b/.test(lower)
}

export async function findLatestXSource(handleOrUrl: string): Promise<XVideoSource | null> {
  const username = normalizeHandle(handleOrUrl)
  if (!username) throw new Error('Missing X handle')

  const userPayload = await xFetch(`/users/by/username/${encodeURIComponent(username)}`)
  const userId = userPayload.data?.id
  if (!userId) return null

  const tweets = await xFetch(`/users/${encodeURIComponent(userId)}/tweets?max_results=20&exclude=retweets,replies&tweet.fields=created_at,entities`)
  for (const tweet of tweets.data || []) {
    const text = tweet.text || ''
    if (!qualifiesAsStreamPost(text)) continue
    const expandedUrls = (tweet.entities?.urls || []).map((u: any) => u.expanded_url || u.unwound_url || u.url).filter(Boolean)
    const broadcastUrl = expandedUrls.find((url: string) => /\/i\/broadcasts\//.test(url)) || extractBroadcastUrl(text)
    const sourceUrl = broadcastUrl || `https://x.com/${username}/status/${tweet.id}`
    return {
      id: `x:${tweet.id}`,
      url: sourceUrl,
      title: text.slice(0, 120) || `${username} X stream`,
      publishedAt: tweet.created_at,
    }
  }

  return null
}
