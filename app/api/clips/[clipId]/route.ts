import { NextRequest, NextResponse } from 'next/server'
import { getClipStableId, normalizeClips } from '@/lib/clip-id'
import { findJobByClipId, updateJobRecord } from '@/lib/job-store/store'
import { Clip } from '@/types'
import { requireAuth } from '@/lib/auth'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { clipId: string } },
) {
  const auth = requireAuth(req)
  if (auth instanceof NextResponse) return auth

  const { clipId } = params

  try {
    // Owner-scoped lookup: scans only this user's 200 most-recent jobs in the
    // database instead of the global newest 200 filtered in JS.
    const found = await findJobByClipId([auth.user.id], clipId, 200, 'api/clips/[clipId] DELETE scan')
    const targetJob = found?.job ?? null

    if (!targetJob) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
    }

    // Remove the clip from the completedClips array
    const completedClips = normalizeClips((targetJob.progress?.completedClips || []) as Clip[])
    const updatedClips = completedClips.filter((c) => getClipStableId(c) !== clipId)

    // Update the job with the filtered clips
    const nextProgress = {
      ...targetJob.progress,
      completedClips: updatedClips,
      deliveredClipCount: updatedClips.length,
      clipShortfallReason: updatedClips.length < (targetJob.progress?.requestedClipCount || updatedClips.length)
        ? `Requested ${targetJob.progress?.requestedClipCount || updatedClips.length}, delivered ${updatedClips.length}.`
        : undefined,
    }

    const updatedJob = await updateJobRecord(targetJob.id, {
      progress: nextProgress,
      updated_at: new Date().toISOString(),
    }, 'api/clips/[clipId] DELETE')
    const updateError = !updatedJob ? new Error('Failed to delete clip') : null

    if (updateError) {
      console.error('Error updating job:', updateError)
      return NextResponse.json({ error: 'Failed to delete clip' }, { status: 500 })
    }

    console.log(`Deleted clip ${clipId} from job ${targetJob.id}`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete clip error:', err)
    return NextResponse.json({ error: 'Failed to delete clip' }, { status: 500 })
  }
}
