import { NextRequest, NextResponse } from 'next/server'
import { listJobRecordsForUsers } from '@/lib/job-store/store'
import { requireSlicerApiAuth } from '@/lib/slicer-api-auth'
import { normalizeJobForApi, publicClip } from '@/lib/slicer-api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireSlicerApiAuth(request, 'clips:read')
  if (auth instanceof NextResponse) return auth

  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 50)))
  const jobId = request.nextUrl.searchParams.get('job_id')
  const rows = await listJobRecordsForUsers(auth.workspaceUserIds, limit, 'api/v1/clips')
  const clips = rows
    .map(normalizeJobForApi)
    .filter((job) => !jobId || job.id === jobId)
    .flatMap((job) => (job.clips || []).map((clip) => publicClip(clip, job)))

  return NextResponse.json({ clips, limit })
}
