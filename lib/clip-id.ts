import { Clip } from '@/types'

type ClipLike = Partial<Clip> & Record<string, any>

function hashString(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

export function getClipStableId(clip: ClipLike): string {
  if (typeof clip.id === 'string' && clip.id.trim()) return clip.id.trim()

  const subtitleSeed = Array.isArray(clip.subtitles)
    ? clip.subtitles.slice(0, 6).map((word) => word?.text || '').join(' ')
    : ''

  const seed = JSON.stringify({
    jobId: clip.job_id ?? '',
    renderId: clip.render_id ?? '',
    r2Key: clip.r2_key ?? '',
    start: clip.start_time ?? '',
    end: clip.end_time ?? '',
    duration: clip.duration ?? '',
    reason: clip.ai_reason ?? '',
    subtitles: subtitleSeed,
  })

  return `clip_${hashString(seed)}`
}

export function normalizeClip<T extends ClipLike>(clip: T): T & { id: string } {
  return {
    ...clip,
    id: getClipStableId(clip),
  }
}

export function normalizeClips<T extends ClipLike>(clips?: T[] | null): Array<T & { id: string }> {
  return (clips ?? []).map((clip) => normalizeClip(clip))
}
