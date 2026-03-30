const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY!
const SHOTSTACK_ENV = process.env.SHOTSTACK_ENV ?? 'stage'
const BASE_URL = `https://api.shotstack.io/${SHOTSTACK_ENV}`

export interface RenderResult {
  renderId: string
  status: string
}

export interface RenderStatus {
  renderId: string
  status: 'queued' | 'fetching' | 'rendering' | 'saving' | 'done' | 'failed'
  url?: string
  error?: string
}

export async function renderClip(
  sourceUrl: string,
  startTime: number,
  endTime: number,
  outputQuality: '720p' | '1080p' = '720p',
): Promise<RenderResult> {
  const resolution = outputQuality === '1080p' ? 'hd' : 'sd'
  const duration = endTime - startTime

  const timeline = {
    tracks: [
      {
        clips: [
          {
            asset: {
              type: 'video',
              src: sourceUrl,
              trim: startTime,
            },
            start: 0,
            length: duration,
          },
        ],
      },
    ],
  }

  const output = {
    format: 'mp4',
    resolution,
  }

  const res = await fetch(`${BASE_URL}/render`, {
    method: 'POST',
    headers: {
      'x-api-key': SHOTSTACK_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ timeline, output }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shotstack render failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  return {
    renderId: data.response?.id ?? data.id,
    status: data.response?.status ?? 'queued',
  }
}

export async function getRenderStatus(renderId: string): Promise<RenderStatus> {
  const res = await fetch(`${BASE_URL}/render/${renderId}`, {
    headers: { 'x-api-key': SHOTSTACK_API_KEY },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Shotstack status check failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  const resp = data.response ?? data

  return {
    renderId: resp.id ?? renderId,
    status: resp.status,
    url: resp.url,
    error: resp.error,
  }
}
