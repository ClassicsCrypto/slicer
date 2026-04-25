import { NextRequest, NextResponse } from 'next/server'
import { createAutoclipSubscription, listAutoclipSubscriptions } from '@/lib/autoclip-store'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') as any
  return NextResponse.json({ subscriptions: listAutoclipSubscriptions(status || undefined) })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const subscription = createAutoclipSubscription(body)
    return NextResponse.json({ subscription }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create subscription' }, { status: 400 })
  }
}
