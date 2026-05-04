import { Clip, Job } from '@/types'
import { getClipStableId, normalizeClips } from '@/lib/clip-id'

export type ClipVoteValue = 'up' | 'down' | 'neutral'

export interface ClipManifestEntry {
  id: string
  job_id: string
  start_time: number
  end_time: number
  duration: number
  virality_score?: number
  ai_reason: string
  matched_categories: string[]
  subtitles: Clip['subtitles']
  proof_frames: Clip['proof_frames']
  vote?: Clip['vote']
  transcript_preview: string
}

export interface SlicerJobManifest {
  schema: 'slicer.clip_manifest.v1'
  generated_at: string
  job: {
    id: string
    title: string
    status: string
    source_url: string
    created_at: string
    updated_at?: string
    stream_context?: string
    options?: Job['options']
    requested_clip_count?: number
    delivered_clip_count: number
    clip_vote_stats?: Job['progress']['clipVoteStats']
  }
  clips: ClipManifestEntry[]
}

function transcriptPreview(clip: Clip): string {
  return (clip.subtitles || [])
    .map((word) => word.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

export function buildSlicerJobManifest(job: Job | any): SlicerJobManifest {
  const progress = job?.progress ?? {}
  const clips = normalizeClips((progress.completedClips ?? job?.clips ?? []) as Clip[])
  return {
    schema: 'slicer.clip_manifest.v1',
    generated_at: new Date().toISOString(),
    job: {
      id: String(job.id),
      title: String(job.title || 'Untitled Slicer job'),
      status: String(job.status || 'unknown'),
      source_url: String(job.source_url || ''),
      created_at: String(job.created_at || ''),
      updated_at: typeof job.updated_at === 'string' ? job.updated_at : undefined,
      stream_context: progress.streamContext,
      options: job.options,
      requested_clip_count: progress.requestedClipCount ?? job.options?.clipCount,
      delivered_clip_count: clips.length,
      clip_vote_stats: progress.clipVoteStats,
    },
    clips: clips.map((clip) => ({
      id: getClipStableId(clip),
      job_id: String(job.id),
      start_time: clip.start_time,
      end_time: clip.end_time,
      duration: clip.duration ?? Math.max(0, clip.end_time - clip.start_time),
      virality_score: clip.virality_score,
      ai_reason: clip.ai_reason,
      matched_categories: clip.matched_categories || [],
      subtitles: clip.subtitles || [],
      proof_frames: clip.proof_frames || [],
      vote: clip.vote,
      transcript_preview: transcriptPreview(clip),
    })),
  }
}

export function computeClipVoteStats(clips: Clip[]) {
  return clips.reduce(
    (stats, clip) => {
      const vote = clip.vote?.value
      if (vote === 'up') stats.up += 1
      else if (vote === 'down') stats.down += 1
      else if (vote === 'neutral') stats.neutral += 1
      return stats
    },
    { up: 0, down: 0, neutral: 0 },
  )
}
