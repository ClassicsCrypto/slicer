import { NextRequest, NextResponse } from 'next/server'
import { getJobRecord } from '@/lib/job-store/store'
import { requireAuth } from '@/lib/auth'
import { buildSlicerJobManifest } from '@/lib/slicer-manifest'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const job = await getJobRecord(params.jobId, 'api/jobs/[jobId]/manifest GET')
  if (!job || job.user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({ manifest: buildSlicerJobManifest(job) })
}
