export interface YouTubeVideoSource {
  id: string
  url: string
  title: string
  publishedAt?: string
}

function normalizeYouTubeInput(handleOrUrl: string) {
  const value = String(handleOrUrl || '').trim()
  if (!value) return { kind: 'unknown' as const, value: '' }

  if (/^UC[a-zA-Z0-9_-]{20,}$/.test(value)) return { kind: 'channelId' as const, value }

  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'channel' && parts[1]) return { kind: 'channelId' as const, value: parts[1] }
    if (parts[0]?.startsWith('@')) return { kind: 'handle' as const, value: parts[0] }
    if (parts[0] === 'c' && parts[1]) return { kind: 'handle' as const, value: parts[1] }
    if (parts[0] === 'user' && parts[1]) return { kind: 'handle' as const, value: parts[1] }
  } catch {}

  return { kind: 'handle' as const, value: value.startsWith('@') ? value : `@${value.replace(/^@/, '')}` }
}

function decodeXml(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

async function resolveChannelId(handleOrUrl: string) {
  const normalized = normalizeYouTubeInput(handleOrUrl)
  if (normalized.kind === 'channelId') return normalized.value
  if (!normalized.value) throw new Error('Missing YouTube channel/handle')

  const handle = normalized.value.startsWith('@') ? normalized.value : `@${normalized.value}`
  const response = await fetch(`https://www.youtube.com/${encodeURIComponent(handle)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 SlicerBot/1.0' },
  })
  if (!response.ok) throw new Error(`YouTube handle lookup failed: ${response.status}`)
  const html = await response.text()
  const channelId = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/)?.[1]
    || html.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]+)">/)?.[1]
    || html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/)?.[1]
  if (!channelId) throw new Error(`Could not resolve YouTube channel ID for ${handle}`)
  return channelId
}

export async function findLatestYouTubeSource(handleOrUrl: string): Promise<YouTubeVideoSource | null> {
  const channelId = await resolveChannelId(handleOrUrl)
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
  const response = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0 SlicerBot/1.0' } })
  if (!response.ok) throw new Error(`YouTube RSS failed: ${response.status}`)
  const xml = await response.text()
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
  const first = entries[0]?.[1]
  if (!first) return null

  const videoId = first.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1]
  const title = decodeXml(first.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || 'YouTube video')
  const publishedAt = first.match(/<published>(.*?)<\/published>/)?.[1]
  if (!videoId) return null

  return {
    id: `youtube:${videoId}`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    publishedAt,
  }
}
