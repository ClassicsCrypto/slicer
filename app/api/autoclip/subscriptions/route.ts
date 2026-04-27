import { NextRequest, NextResponse } from 'next/server'
import { createAutoclipSubscription, listAutoclipSubscriptions, withAutoclipSharing } from '@/lib/autoclip-store'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const status = request.nextUrl.searchParams.get('status') as any
  const scope = { userId: auth.user.id, workspaceId: auth.workspace.id }
  return NextResponse.json({
    subscriptions: listAutoclipSubscriptions(status || undefined, scope).map((subscription) => withAutoclipSharing(subscription, scope)),
  })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const scope = { userId: auth.user.id, workspaceId: auth.workspace.id }
    const subscription = createAutoclipSubscription({
      ...body,
      ownerName: body.ownerName || auth.user.displayName,
      ownerEmail: body.ownerEmail || auth.user.email || undefined,
    }, scope)
    return NextResponse.json({ subscription: withAutoclipSharing(subscription, scope) }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create subscription' }, { status: 400 })
  }
}
