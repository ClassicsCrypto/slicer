import { NextRequest, NextResponse } from 'next/server'
import { deleteAutoclipSubscription, getAutoclipSubscription, updateAutoclipSubscription } from '@/lib/autoclip-store'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: { params: { subscriptionId: string } }) {
  const subscription = getAutoclipSubscription(params.subscriptionId)
  if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  return NextResponse.json({ subscription })
}

export async function PATCH(request: NextRequest, { params }: { params: { subscriptionId: string } }) {
  try {
    const body = await request.json()
    const subscription = updateAutoclipSubscription(params.subscriptionId, body)
    if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    return NextResponse.json({ subscription })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to update subscription' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { subscriptionId: string } }) {
  const deleted = deleteAutoclipSubscription(params.subscriptionId)
  if (!deleted) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
