import { NextRequest, NextResponse } from 'next/server'
import { revokeApiKey } from '@/lib/slicer-api-auth'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: { keyId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (auth.workspace.role !== 'owner' && auth.workspace.role !== 'editor') {
    return NextResponse.json({ error: 'Owner or editor role required' }, { status: 403 })
  }

  const revoked = revokeApiKey(auth.workspace.id, params.keyId)
  return NextResponse.json({ revoked })
}
