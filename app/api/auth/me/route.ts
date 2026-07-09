import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { getAuthContext, markUserOnboarded } from '@/lib/auth'
import { resolveEnsNameForAddress } from '@/lib/ens'
import { DATA_DIR, DB_PATH } from '@/lib/data-dir'

function getLinkedAccountsForUser(userId: string) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    const db = new Database(DB_PATH)
    const rows = db.prepare(`
      SELECT provider, provider_account_id FROM linked_accounts
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `).all(userId) as Array<{ provider: string; provider_account_id: string }>
    db.close()
    return rows
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth) return NextResponse.json({ authenticated: false }, { status: 401 })

  const linkedAccounts = getLinkedAccountsForUser(auth.user.id)
  const walletAddress = linkedAccounts.find((account) => account.provider === 'wallet')?.provider_account_id || null
  const linkedProviders = Array.from(new Set(linkedAccounts.map((account) => account.provider)))
  const ensName = await resolveEnsNameForAddress(walletAddress)

  return NextResponse.json({
    authenticated: true,
    user: {
      ...auth.user,
      walletAddress,
      ensName,
      linkedProviders,
      displayName: ensName || auth.user.displayName,
    },
    workspace: auth.workspace,
    isDevBypass: auth.isDevBypass,
  })
}

export async function POST(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth) return NextResponse.json({ authenticated: false }, { status: 401 })

  let action = ''
  try {
    const body = await request.json()
    action = typeof body?.action === 'string' ? body.action : ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (action !== 'complete_onboarding') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const onboardedAt = markUserOnboarded(auth.user.id)
  return NextResponse.json({ ok: true, onboardedAt })
}
