import { NextRequest, NextResponse } from 'next/server'
import { getClipStableId, normalizeClips } from '@/lib/clip-id'
import { createServerClient } from '@/lib/supabase'
import { mirrorJobToShadowSqlite } from '@/lib/job-store/shadow'
import { Clip } from '@/types'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { clipId: string } },
) {
  const { clipId } = params
  const supabase = createServerClient()

  try {
    // Find the job that contains this clip
    const { data: jobs, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .not('progress', 'is', null)

    if (fetchError) {
      console.error('Error fetching jobs:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    // Find which job contains this clip
    let targetJob: Record<string, any> | null = null
    for (const job of jobs || []) {
      const completedClips = normalizeClips((job.progress?.completedClips || []) as Clip[])
      if (completedClips.some((c) => getClipStableId(c) === clipId)) {
        targetJob = job
        break
      }
    }

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

    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({ progress: nextProgress })
      .eq('id', targetJob.id)
      .select('*')
      .single()

    if (updateError) {
      console.error('Error updating job:', updateError)
      return NextResponse.json({ error: 'Failed to delete clip' }, { status: 500 })
    }

    await mirrorJobToShadowSqlite(updatedJob ?? { ...targetJob, progress: nextProgress }, 'api/clips/[clipId] DELETE')
    console.log(`Deleted clip ${clipId} from job ${targetJob.id}`)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete clip error:', err)
    return NextResponse.json({ error: 'Failed to delete clip' }, { status: 500 })
  }
}
