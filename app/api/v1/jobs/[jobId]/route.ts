import { NextRequest, NextResponse } from 'next/server'
import { getJobRecord } from '@/lib/job-store/store'
import { requireSlicerApiAuth } from '@/lib/slicer-api-auth'
import { normalizeJobForApi, publicJob } from '@/lib/slicer-api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const auth = requireSlicerApiAuth(request, 'jobs:read')
  if (auth instanceof NextResponse) return auth

  const row = await getJobRecord(params.jobId, 'api/v1/jobs/[jobId]')
  if (!row) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const job = normalizeJobForApi(row)
  if (!auth.workspaceUserIds.includes(job.user_id)) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({ job: publicJob(job, true) })
}
