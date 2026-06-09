import { NextRequest, NextResponse } from 'next/server'
import { createWalletNonce } from '@/lib/auth'
import { getPublicBaseUrl } from '@/lib/public-url'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { walletAddress?: string }
  if (!body.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(body.walletAddress)) {
    return NextResponse.json({ error: 'Valid walletAddress is required' }, { status: 400 })
  }

  return NextResponse.json(createWalletNonce(body.walletAddress, getPublicBaseUrl(request.nextUrl, request.headers)))
}
