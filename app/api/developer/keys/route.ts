import { NextRequest, NextResponse } from 'next/server'
import { createApiKey, listApiKeys } from '@/lib/slicer-api-auth'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({ keys: listApiKeys(auth.workspace.id) })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (auth.workspace.role !== 'owner' && auth.workspace.role !== 'editor') {
    return NextResponse.json({ error: 'Owner or editor role required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { key, record } = createApiKey({
    workspaceId: auth.workspace.id,
    createdByUserId: auth.user.id,
    name: typeof body.name === 'string' ? body.name : 'Slicer API Key',
    scopes: Array.isArray(body.scopes) ? body.scopes : undefined,
  })

  return NextResponse.json({ key, record }, { status: 201 })
}
