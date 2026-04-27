import { NextRequest, NextResponse } from 'next/server'
import { listJobRecords } from '@/lib/job-store/store'
import { requireSlicerApiAuth } from '@/lib/slicer-api-auth'
import { normalizeJobForApi, publicJob } from '@/lib/slicer-api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireSlicerApiAuth(request, 'jobs:read')
  if (auth instanceof NextResponse) return auth

  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 50)))
  const includeClips = request.nextUrl.searchParams.get('include_clips') !== 'false'
  const rows = await listJobRecords(limit, 'api/v1/jobs')
  const jobs = rows
    .map(normalizeJobForApi)
    .filter((job) => auth.workspaceUserIds.includes(job.user_id))
    .map((job) => publicJob(job, includeClips))

  return NextResponse.json({ jobs, limit })
}
