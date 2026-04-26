import { NextRequest, NextResponse } from 'next/server'
import { getAddress, verifyMessage } from 'viem'
import { attachSessionCookie, consumeWalletNonce, createSession, getWalletNonce, upsertOAuthUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { walletAddress?: string; signature?: `0x${string}` }
  if (!body.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(body.walletAddress) || !body.signature) {
    return NextResponse.json({ error: 'walletAddress and signature are required' }, { status: 400 })
  }

  const walletAddress = getAddress(body.walletAddress)
  const nonce = getWalletNonce(walletAddress)
  if (!nonce) return NextResponse.json({ error: 'Wallet nonce expired or missing' }, { status: 400 })

  const valid = await verifyMessage({ address: walletAddress, message: nonce.message, signature: body.signature })
  if (!valid) return NextResponse.json({ error: 'Invalid wallet signature' }, { status: 401 })

  consumeWalletNonce(walletAddress)
  const shortWallet = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
  const { userId, workspaceId } = upsertOAuthUser({
    provider: 'wallet',
    providerAccountId: walletAddress.toLowerCase(),
    email: null,
    displayName: shortWallet,
    avatarUrl: null,
  })
  const { token, expiresAt } = createSession(userId, workspaceId)
  const response = NextResponse.json({ ok: true, redirectTo: '/dashboard' })
  attachSessionCookie(response, token, expiresAt)
  return response
}
