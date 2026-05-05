import { NextRequest, NextResponse } from 'next/server'
import { getAddress, verifyMessage } from 'viem'
import { attachSessionCookie, consumeWalletNonce, createSession, getAuthContext, getWalletNonce, upsertOAuthUser } from '@/lib/auth'
import { resolveEnsNameForAddress, shortWalletAddress } from '@/lib/ens'

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
  const ensName = await resolveEnsNameForAddress(walletAddress)
  const displayName = ensName || shortWalletAddress(walletAddress)
  const currentAuth = getAuthContext(request)
  const linkToUserId = currentAuth?.isDevBypass ? null : currentAuth?.user.id
  let account: { userId: string; workspaceId: string }
  try {
    account = upsertOAuthUser({
      provider: 'wallet',
      providerAccountId: walletAddress.toLowerCase(),
      email: null,
      displayName,
      avatarUrl: null,
      linkToUserId,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not link that wallet.' }, { status: 409 })
  }
  const { token, expiresAt } = createSession(account.userId, account.workspaceId)
  const response = NextResponse.json({ ok: true, linked: Boolean(linkToUserId), redirectTo: '/dashboard' })
  attachSessionCookie(response, token, expiresAt)
  return response
}
