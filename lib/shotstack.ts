/**
 * Shotstack API integration for video clipping
 * Docs: https://shotstack.io/docs/api/
 * 
 * SHOTSTACK_ENV controls sandbox vs production:
 *   - "stage" (default) → sandbox, 24h URLs, free, slower
 *   - "v1" → production, 7-day URLs, paid, faster
 */

const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV || 'stage'
const SHOTSTACK_BASE = `https://api.shotstack.io/${SHOTSTACK_ENV}`
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || ''

export interface ShotstackClipSpec {
  sourceUrl: string
  startTime: number
  endTime: number
  outputFormat: 'mp4'
  outputQuality: '720p' | '1080p' | '4k'
  platformFormat: 'tiktok' | 'twitter' | 'youtube_shorts' | 'custom'
}

function getResolution(quality: string) {
  switch (quality) {
    case '4k':   return { width: 3840, height: 2160 }
    case '1080p': return { width: 1920, height: 1080 }
    default:      return { width: 1280, height: 720 }
  }
}

function getAspectRatio(format: string) {
  switch (format) {
    case 'tiktok':
    case 'youtube_shorts':
      return { width: 1080, height: 1920 }
    case 'twitter':
      return { width: 1920, height: 1080 }
    default:
      return null
  }
}

export async function renderClip(spec: ShotstackClipSpec): Promise<string> {
  if (!SHOTSTACK_API_KEY) throw new Error('SHOTSTACK_API_KEY not set')

  const duration = spec.endTime - spec.startTime
  const res = getResolution(spec.outputQuality)
  const aspect = getAspectRatio(spec.platformFormat)
  const outputRes = aspect || res

  const payload = {
    timeline: {
      tracks: [{
        clips: [{
          asset: {
            type: 'video',
            src: spec.sourceUrl,
            trim: spec.startTime,
          },
          start: 0,
          length: duration,
          fit: aspect ? 'crop' : 'contain',
        }],
      }],
    },
    output: {
      format: 'mp4',
      resolution: outputRes.width <= 1280 ? 'sd' : outputRes.width <= 1920 ? 'hd' : '4k',
      size: { width: outputRes.width, height: outputRes.height },
    },
  }

  const response = await fetch(`${SHOTSTACK_BASE}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SHOTSTACK_API_KEY,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Shotstack render failed: ${response.status} ${text}`)
  }

  const data = await response.json()
  return data.response.id as string
}

export async function getRenderStatus(renderId: string): Promise<{ status: string; url?: string }> {
  if (!SHOTSTACK_API_KEY) throw new Error('SHOTSTACK_API_KEY not set')

  const response = await fetch(`${SHOTSTACK_BASE}/render/${renderId}`, {
    headers: { 'x-api-key': SHOTSTACK_API_KEY },
  })

  if (!response.ok) throw new Error(`Status check failed: ${response.status}`)

  const data = await response.json()
  const render = data.response

  return {
    status: render.status,
    url: render.url,
  }
}
