import { NextRequest, NextResponse } from 'next/server'
import { deleteAutoclipSubscription, getAutoclipSubscription, updateAutoclipSubscription } from '@/lib/autoclip-store'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { subscriptionId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const subscription = getAutoclipSubscription(params.subscriptionId, { userId: auth.user.id, workspaceId: auth.workspace.id })
  if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  return NextResponse.json({ subscription })
}

export async function PATCH(request: NextRequest, { params }: { params: { subscriptionId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const body = await request.json()
    const subscription = updateAutoclipSubscription(params.subscriptionId, body, { userId: auth.user.id, workspaceId: auth.workspace.id })
    if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    return NextResponse.json({ subscription })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to update subscription' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { subscriptionId: string } }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const deleted = deleteAutoclipSubscription(params.subscriptionId, { userId: auth.user.id, workspaceId: auth.workspace.id })
  if (!deleted) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
