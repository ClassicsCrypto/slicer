import { Clip, Job, JobProgress } from '@/types'
import { getClipStableId } from '@/lib/clip-id'

export function normalizeJobForApi(job: any): Job {
  const progress = (job?.progress ?? {}) as JobProgress
  return {
    ...job,
    progress,
    clips: (progress.completedClips ?? []) as Clip[],
  }
}

export function publicClip(clip: Clip, job: Job) {
  const clipId = getClipStableId(clip)
  return {
    id: clipId,
    job_id: job.id,
    title: job.title,
    status: job.status,
    source_url: job.source_url,
    start_time: clip.start_time,
    end_time: clip.end_time,
    duration: clip.duration,
    virality_score: clip.virality_score,
    ai_reason: clip.ai_reason,
    matched_categories: clip.matched_categories || [],
    proof_frames: clip.proof_frames || [],
    vote: clip.vote,
    subtitles: clip.subtitles || [],
    thumbnail_hint: (clip.proof_frames || []).find((frame) => frame.label === 'best') || null,
    created_at: clip.created_at || job.created_at,
  }
}

export function publicJob(job: Job, includeClips = true) {
  const clips = job.clips || []
  return {
    id: job.id,
    title: job.title,
    status: job.status,
    source_url: job.source_url,
    created_at: job.created_at,
    updated_at: (job as any).updated_at,
    options: job.options,
    progress: {
      phase: job.progress?.phase,
      progress: job.progress?.progress,
      streamContext: job.progress?.streamContext,
      requestedClipCount: job.progress?.requestedClipCount,
      deliveredClipCount: job.progress?.deliveredClipCount,
      clipShortfallReason: job.progress?.clipShortfallReason,
      completedAt: job.progress?.completedAt,
    },
    clips: includeClips ? clips.map((clip) => publicClip(clip, job)) : undefined,
  }
}
