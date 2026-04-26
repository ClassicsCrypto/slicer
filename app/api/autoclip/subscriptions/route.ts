import { NextRequest, NextResponse } from 'next/server'
import { createAutoclipSubscription, listAutoclipSubscriptions } from '@/lib/autoclip-store'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const status = request.nextUrl.searchParams.get('status') as any
  return NextResponse.json({ subscriptions: listAutoclipSubscriptions(status || undefined, { userId: auth.user.id, workspaceId: auth.workspace.id }) })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const subscription = createAutoclipSubscription({
      ...body,
      ownerName: body.ownerName || auth.user.displayName,
      ownerEmail: body.ownerEmail || auth.user.email || undefined,
    }, { userId: auth.user.id, workspaceId: auth.workspace.id })
    return NextResponse.json({ subscription }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create subscription' }, { status: 400 })
  }
}
