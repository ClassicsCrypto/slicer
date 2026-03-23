/**
 * Shotstack API integration for video clipping + subtitle rendering
 * Docs: https://shotstack.io/docs/api/
 */

const SHOTSTACK_API_URL = 'https://api.shotstack.io/stage/render' // sandbox
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || ''

export interface ShotstackClipSpec {
  sourceUrl: string       // public URL of the source video
  startTime: number       // seconds into source video
  endTime: number         // seconds into source video
  subtitles?: {
    text: string
    style: string
    color: string
  }[]
  outputFormat: 'mp4'
  outputQuality: '720p' | '1080p' | '4k'
  platformFormat: 'tiktok' | 'twitter' | 'youtube_shorts' | 'custom'
  madeWithSlicer: boolean
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
      return { width: 1080, height: 1920 } // 9:16
    case 'twitter':
      return { width: 1920, height: 1080 } // 16:9
    default:
      return null // original
  }
}

export async function renderClip(spec: ShotstackClipSpec): Promise<string> {
  if (!SHOTSTACK_API_KEY) throw new Error('SHOTSTACK_API_KEY not set')

  const duration = spec.endTime - spec.startTime
  const res = getResolution(spec.outputQuality)
  const aspect = getAspectRatio(spec.platformFormat)
  const outputRes = aspect || res

  // Build Shotstack render payload
  const clips: object[] = [
    {
      asset: {
        type: 'video',
        src: spec.sourceUrl,
        trim: spec.startTime,
      },
      start: 0,
      length: duration,
      fit: aspect ? 'crop' : 'contain',
    }
  ]

  // Add subtitle overlays
  if (spec.subtitles && spec.subtitles.length > 0) {
    for (const cue of spec.subtitles) {
      clips.push({
        asset: {
          type: 'html',
          html: `<p style="color:${cue.color || '#ffffff'};font-size:40px;font-weight:bold;text-align:center;text-shadow:2px 2px 4px rgba(0,0,0,0.8)">${cue.text}</p>`,
          width: outputRes.width,
          height: 120,
        },
        start: 0,
        length: duration,
        position: 'bottom',
        offset: { y: -0.1 },
      })
    }
  }

  // Add "Made with Slicer" outro — use native color asset for background (HTML divs don't render in Shotstack)
  if (spec.madeWithSlicer) {
    // Solid teal background using native color asset
    clips.push({
      asset: {
        type: 'color',
        colour: '#00BFA5',
      },
      start: duration,
      length: 2,
      position: 'center',
    })
    // "✂️ Slicer" title
    clips.push({
      asset: {
        type: 'html',
        html: `<p style="color:#000000;font-size:64px;font-weight:900;font-family:Arial Black,Arial,sans-serif;text-align:center;margin:0;padding:0;">&#9986; Slicer</p>`,
        width: outputRes.width,
        height: 120,
      },
      start: duration,
      length: 2,
      position: 'center',
      offset: { y: 0.06 },
    })
    // "by Mars Cats Voyage" subtitle
    clips.push({
      asset: {
        type: 'html',
        html: `<p style="color:#003D33;font-size:30px;font-family:Arial,sans-serif;text-align:center;margin:0;padding:0;">by Mars Cats Voyage</p>`,
        width: outputRes.width,
        height: 60,
      },
      start: duration,
      length: 2,
      position: 'center',
      offset: { y: -0.06 },
    })
  }

  const payload = {
    timeline: {
      tracks: [{ clips }],
    },
    output: {
      format: 'mp4',
      resolution: `${outputRes.width <= 1280 ? 'sd' : outputRes.width <= 1920 ? 'hd' : '4k'}`,
      size: { width: outputRes.width, height: outputRes.height },
    },
  }

  const response = await fetch(SHOTSTACK_API_URL, {
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
  return data.response.id as string // render ID to poll
}

export async function getRenderStatus(renderId: string): Promise<{ status: string; url?: string }> {
  if (!SHOTSTACK_API_KEY) throw new Error('SHOTSTACK_API_KEY not set')

  const response = await fetch(`https://api.shotstack.io/stage/render/${renderId}`, {
    headers: { 'x-api-key': SHOTSTACK_API_KEY },
  })

  if (!response.ok) throw new Error(`Status check failed: ${response.status}`)

  const data = await response.json()
  const render = data.response

  return {
    status: render.status, // queued | fetching | rendering | saving | done | failed
    url: render.url,       // available when status === 'done'
  }
}
