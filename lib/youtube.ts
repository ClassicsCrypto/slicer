export interface YouTubeVideoSource {
  id: string
  url: string
  title: string
  publishedAt?: string
  durationSec?: number
  liveStatus?: string
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
    || html.match(/"browseId":"(UC[a-zA-Z0-9_-]+)"/)?.[1]
    || html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/)?.[1]
    || html.match(/<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]+)">/)?.[1]
    || html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/)?.[1]
  if (!channelId) throw new Error(`Could not resolve YouTube channel ID for ${handle}`)
  return channelId
}

function parseFirstFeedEntry(xml: string): YouTubeVideoSource | null {
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

function isReadyYouTubeLiveStatus(status?: string) {
  const liveStatus = String(status || '').toLowerCase()
  return liveStatus !== 'is_upcoming' && liveStatus !== 'is_live'
}

function isReadyYouTubeEntry(entry: any) {
  if (!entry?.id) return false
  if (!isReadyYouTubeLiveStatus(entry.live_status)) return false
  const duration = Number(entry.duration || 0)
  return Number.isFinite(duration) && duration > 0
}

function parseYtDlpInfoLine(stdout: string) {
  const line = stdout.trim().split(/\r?\n/).find((item) => item.includes('|||')) || ''
  const [durationRaw, title, id, liveStatus, timestampRaw, releaseTimestampRaw, uploadDate] = line.split('|||')
  const durationSec = Number(durationRaw || 0)
  if (!id || !Number.isFinite(durationSec) || durationSec <= 0 || !isReadyYouTubeLiveStatus(liveStatus)) return null
  const timestamp = Number(timestampRaw || releaseTimestampRaw || 0)
  const publishedAt = Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp * 1000).toISOString()
    : /^\d{8}$/.test(uploadDate || '')
      ? `${uploadDate!.slice(0, 4)}-${uploadDate!.slice(4, 6)}-${uploadDate!.slice(6, 8)}T00:00:00.000Z`
      : undefined
  return { durationSec, title: title || 'YouTube video', id, liveStatus, publishedAt }
}

async function findLatestYouTubeSourceWithYtDlp(channelId: string, handleOrUrl: string): Promise<YouTubeVideoSource | null> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)
  const targets = [
    `https://www.youtube.com/channel/${channelId}/streams`,
    `https://www.youtube.com/${handleOrUrl.startsWith('@') ? handleOrUrl : `@${handleOrUrl.replace(/^@/, '')}`}/streams`,
    `https://www.youtube.com/${handleOrUrl.startsWith('@') ? handleOrUrl : `@${handleOrUrl.replace(/^@/, '')}`}`,
  ]

  for (const target of targets) {
    try {
      const { stdout } = await execFileAsync('yt-dlp', ['--js-runtimes', 'node', '--remote-components', 'ejs:github', '--dump-single-json', '--flat-playlist', target], { timeout: 45_000, maxBuffer: 10 * 1024 * 1024 })
      const parsed = JSON.parse(stdout)
      const entries = Array.isArray(parsed.entries) ? parsed.entries : []
      const candidates = entries
        .filter((item: any) => item?.id && Number(item.duration || 0) > 0)
        .sort((a: any, b: any) => (isReadyYouTubeEntry(b) ? 1 : 0) - (isReadyYouTubeEntry(a) ? 1 : 0))
      for (const entry of candidates) {
        const url = entry.url || `https://www.youtube.com/watch?v=${entry.id}`
        try {
          const info = await execFileAsync('yt-dlp', ['--js-runtimes', 'node', '--remote-components', 'ejs:github', '--no-download', '--print', '%(duration)s|||%(title)s|||%(id)s|||%(live_status)s|||%(timestamp)s|||%(release_timestamp)s|||%(upload_date)s', url], { timeout: 30_000, maxBuffer: 1024 * 1024 })
          const verified = parseYtDlpInfoLine(info.stdout)
          if (!verified) continue
          return {
            id: `youtube:${verified.id}`,
            url,
            title: verified.title || entry.title || 'YouTube video',
            publishedAt: verified.publishedAt || (entry.timestamp ? new Date(entry.timestamp * 1000).toISOString() : undefined),
            durationSec: verified.durationSec,
            liveStatus: verified.liveStatus,
          }
        } catch {
          // Recently-ended and scheduled lives often fail single-video extraction; skip them.
        }
      }
    } catch {
      // Try the next shape. YouTube tabs are inconsistent across channels.
    }
  }

  return null
}

export async function findLatestYouTubeSource(handleOrUrl: string): Promise<YouTubeVideoSource | null> {
  const channelId = await resolveChannelId(handleOrUrl)

  // For stream/VOD autoclip we need a finished, downloadable video. YouTube RSS can expose
  // scheduled live events before yt-dlp can read/download them, which creates doomed jobs.
  const fallback = await findLatestYouTubeSourceWithYtDlp(channelId, handleOrUrl)
  if (fallback) return fallback

  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
  const response = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0 SlicerBot/1.0' } })
  if (!response.ok) throw new Error(`YouTube RSS failed: ${response.status}`)
  const xml = await response.text()
  return parseFirstFeedEntry(xml)
}
