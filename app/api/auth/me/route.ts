import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { getAuthContext } from '@/lib/auth'
import { resolveEnsNameForAddress } from '@/lib/ens'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const DB_PATH = path.join(DATA_DIR, 'slicer.sqlite')

function getWalletAddressForUser(userId: string) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const db = new Database(DB_PATH)
    const row = db.prepare(`
      SELECT provider_account_id FROM linked_accounts
      WHERE user_id = ? AND provider = 'wallet'
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(userId) as { provider_account_id?: string } | undefined
    db.close()
    return row?.provider_account_id || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth) return NextResponse.json({ authenticated: false }, { status: 401 })

  const walletAddress = auth.user.primaryProvider === 'wallet'
    ? getWalletAddressForUser(auth.user.id)
    : null
  const ensName = await resolveEnsNameForAddress(walletAddress)

  return NextResponse.json({
    authenticated: true,
    user: {
      ...auth.user,
      walletAddress,
      ensName,
      displayName: ensName || auth.user.displayName,
    },
    workspace: auth.workspace,
    isDevBypass: auth.isDevBypass,
  })
}
