import { NextRequest, NextResponse } from 'next/server'
import { getJobRecord, mutateJobRecord } from '@/lib/job-store/store'
import { getClipStableId, normalizeClips } from '@/lib/clip-id'
import { requireAuth } from '@/lib/auth'
import { computeClipVoteStats } from '@/lib/slicer-manifest'
import { Clip, ClipVoteValue } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_VOTES = new Set<ClipVoteValue>(['up', 'down', 'neutral'])

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string; clipId: string } },
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const job = await getJobRecord(params.jobId, 'api/jobs/[jobId]/clips/[clipId]/vote fetch')
  if (!job || job.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const value = body.value as ClipVoteValue
  if (!VALID_VOTES.has(value)) {
    return NextResponse.json({ error: 'Vote must be up, down, or neutral' }, { status: 400 })
  }

  // The clip map + vote-stat computation runs inside the store transaction on
  // the FRESH row — a concurrent progress write (worker tick, another vote)
  // can no longer be clobbered by a stale completedClips spread.
  let found = false
  let savedClips: Clip[] = []
  let savedStats: ReturnType<typeof computeClipVoteStats> | null = null

  const updatedJob = await mutateJobRecord(params.jobId, (existing) => {
    const progress = existing.progress ?? {}
    const completedClips = normalizeClips((progress.completedClips ?? []) as Clip[])
    found = false
    const updatedClips = completedClips.map((clip) => {
      if (getClipStableId(clip) !== params.clipId) return clip
      found = true
      return {
        ...clip,
        vote: {
          value,
          reason: typeof body.reason === 'string' ? body.reason.slice(0, 120) : undefined,
          note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
          voted_at: new Date().toISOString(),
        },
      }
    })

    if (!found) return null

    savedClips = updatedClips
    savedStats = computeClipVoteStats(updatedClips)
    return {
      ...existing,
      updated_at: new Date().toISOString(),
      progress: {
        ...progress,
        completedClips: updatedClips,
        clipVoteStats: savedStats,
      },
    }
  }, 'api/jobs/[jobId]/clips/[clipId]/vote update')

  if (!found) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
  }

  if (!updatedJob) {
    return NextResponse.json({ error: 'Failed to save vote' }, { status: 500 })
  }

  const clip = savedClips.find((candidate) => getClipStableId(candidate) === params.clipId)
  return NextResponse.json({ clip, clipVoteStats: savedStats })
}
