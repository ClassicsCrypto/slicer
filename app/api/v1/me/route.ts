import { NextRequest, NextResponse } from 'next/server'
import { requireSlicerApiAuth } from '@/lib/slicer-api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireSlicerApiAuth(request, 'jobs:read')
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({
    api: 'slicer',
    version: 'v1',
    workspace_id: auth.workspaceId,
    key_id: auth.keyId,
    scopes: auth.scopes,
  })
}
