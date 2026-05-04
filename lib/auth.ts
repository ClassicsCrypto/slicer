import 'server-only'

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { NextRequest, NextResponse } from 'next/server'

const DATA_DIR = path.join(process.cwd(), 'server', 'data')
const DB_PATH = path.join(DATA_DIR, 'slicer.sqlite')
const SESSION_COOKIE = 'slicer_session'
const SESSION_DAYS = 30
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000101'

type AuthProvider = 'discord' | 'google' | 'wallet' | 'email'
export type WorkspaceRole = 'owner' | 'editor' | 'viewer'

export type AuthUser = {
  id: string
  email: string | null
  displayName: string
  avatarUrl: string | null
  primaryProvider: AuthProvider | 'dev'
}

export type AuthWorkspace = {
  id: string
  name: string
  slug: string
  role: WorkspaceRole
}

export type AuthContext = {
  user: AuthUser
  workspace: AuthWorkspace
  isDevBypass: boolean
}

type UserRow = {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
  primary_provider: string
  created_at: string
  updated_at: string
}

type WorkspaceRow = {
  id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

type MembershipRow = {
  workspace_id: string
  user_id: string
  role: WorkspaceRole
}

let db: Database.Database | null = null

function getDb() {
  if (db) return db
  fs.mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  ensureAuthSchema(db)
  return db
}

function ensureAuthSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      primary_provider TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_memberships (
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, user_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS linked_accounts (
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      avatar_url TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, provider_account_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallet_nonces (
      wallet_address TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_login_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      scopes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
}

function nowIso() {
  return new Date().toISOString()
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function uuid() {
  return crypto.randomUUID()
}

function slugify(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return slug || `workspace-${randomToken(4)}`
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    primaryProvider: row.primary_provider as AuthUser['primaryProvider'],
  }
}

function toWorkspace(row: WorkspaceRow, role: WorkspaceRole): AuthWorkspace {
  return { id: row.id, name: row.name, slug: row.slug, role }
}

export function isAuthBypassed() {
  return process.env.SKIP_AUTH === 'true' || process.env.NEXT_PUBLIC_SKIP_AUTH === 'true'
}

export function getSessionCookieName() {
  return SESSION_COOKIE
}

export function ensureDevAuthContext(): AuthContext {
  const database = getDb()
  const ts = nowIso()
  database.prepare(`
    INSERT INTO users (id, email, display_name, avatar_url, primary_provider, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(DEFAULT_USER_ID, 'dev@slicer.local', 'Slicer Dev User', null, 'dev', ts, ts)
  database.prepare(`
    INSERT INTO workspaces (id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(DEFAULT_WORKSPACE_ID, 'Slicer Dev Workspace', 'slicer-dev', ts, ts)
  database.prepare(`
    INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
  `).run(DEFAULT_WORKSPACE_ID, DEFAULT_USER_ID, 'owner', ts, ts)

  return {
    user: {
      id: DEFAULT_USER_ID,
      email: 'dev@slicer.local',
      displayName: 'Slicer Dev User',
      avatarUrl: null,
      primaryProvider: 'dev',
    },
    workspace: {
      id: DEFAULT_WORKSPACE_ID,
      name: 'Slicer Dev Workspace',
      slug: 'slicer-dev',
      role: 'owner',
    },
    isDevBypass: true,
  }
}

export function upsertOAuthUser(input: {
  provider: AuthProvider
  providerAccountId: string
  email?: string | null
  displayName: string
  avatarUrl?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  expiresAt?: string | null
}) {
  const database = getDb()
  const ts = nowIso()
  const existingAccount = database.prepare(`
    SELECT user_id FROM linked_accounts WHERE provider = ? AND provider_account_id = ?
  `).get(input.provider, input.providerAccountId) as { user_id: string } | undefined

  let userId = existingAccount?.user_id
  if (!userId && input.email) {
    const existingUser = database.prepare('SELECT id FROM users WHERE email = ?').get(input.email) as { id: string } | undefined
    userId = existingUser?.id
  }
  if (!userId) userId = uuid()

  database.prepare(`
    INSERT INTO users (id, email, display_name, avatar_url, primary_provider, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      email = COALESCE(excluded.email, users.email),
      display_name = excluded.display_name,
      avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
      updated_at = excluded.updated_at
  `).run(userId, input.email ?? null, input.displayName, input.avatarUrl ?? null, input.provider, ts, ts)

  database.prepare(`
    INSERT INTO linked_accounts (provider, provider_account_id, user_id, email, display_name, avatar_url, access_token, refresh_token, expires_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_account_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, linked_accounts.refresh_token),
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run(
    input.provider,
    input.providerAccountId,
    userId,
    input.email ?? null,
    input.displayName,
    input.avatarUrl ?? null,
    input.accessToken ?? null,
    input.refreshToken ?? null,
    input.expiresAt ?? null,
    ts,
    ts,
  )

  const workspace = ensureDefaultWorkspaceForUser(userId, input.displayName)
  return { userId, workspaceId: workspace.id }
}

export function createEmailLoginCode(email: string) {
  const normalized = email.trim().toLowerCase()
  const code = crypto.randomInt(100000, 1000000).toString()
  const ts = nowIso()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  getDb().prepare(`
    INSERT INTO email_login_codes (email, code_hash, attempts, created_at, expires_at)
    VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      code_hash = excluded.code_hash,
      attempts = 0,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at
  `).run(normalized, hashToken(code), ts, expiresAt)

  return { email: normalized, code, expiresAt }
}

export function consumeEmailLoginCode(email: string, code: string) {
  const normalized = email.trim().toLowerCase()
  const database = getDb()
  const row = database.prepare(`
    SELECT * FROM email_login_codes WHERE email = ? AND expires_at > ?
  `).get(normalized, nowIso()) as { email: string; code_hash: string; attempts: number } | undefined

  if (!row || row.attempts >= 5) return null

  if (row.code_hash !== hashToken(code.trim())) {
    database.prepare('UPDATE email_login_codes SET attempts = attempts + 1 WHERE email = ?').run(normalized)
    return null
  }

  database.prepare('DELETE FROM email_login_codes WHERE email = ?').run(normalized)
  const displayName = normalized.split('@')[0] || 'Slicer User'
  return upsertOAuthUser({
    provider: 'email',
    providerAccountId: normalized,
    email: normalized,
    displayName,
    avatarUrl: null,
  })
}

function ensureDefaultWorkspaceForUser(userId: string, displayName: string): WorkspaceRow {
  const database = getDb()
  const existing = database.prepare(`
    SELECT w.* FROM workspaces w
    JOIN workspace_memberships wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY wm.created_at ASC
    LIMIT 1
  `).get(userId) as WorkspaceRow | undefined
  if (existing) return existing

  const ts = nowIso()
  const workspaceId = uuid()
  const baseSlug = slugify(`${displayName} workspace`)
  let slug = baseSlug
  let counter = 2
  while (database.prepare('SELECT id FROM workspaces WHERE slug = ?').get(slug)) {
    slug = `${baseSlug}-${counter++}`
  }

  database.prepare(`
    INSERT INTO workspaces (id, name, slug, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(workspaceId, `${displayName}'s Workspace`, slug, ts, ts)
  database.prepare(`
    INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at, updated_at)
    VALUES (?, ?, 'owner', ?, ?)
  `).run(workspaceId, userId, ts, ts)
  return { id: workspaceId, name: `${displayName}'s Workspace`, slug, created_at: ts, updated_at: ts }
}

export function createSession(userId: string, workspaceId: string) {
  const database = getDb()
  const token = randomToken(48)
  const tokenHash = hashToken(token)
  const ts = nowIso()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  database.prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, workspace_id, created_at, expires_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenHash, userId, workspaceId, ts, expiresAt, ts)
  return { token, expiresAt }
}

export function attachSessionCookie(response: NextResponse, token: string, expiresAt: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
}

export function revokeSessionToken(token?: string | null) {
  if (!token) return
  getDb().prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?').run(nowIso(), hashToken(token))
}

export function getAuthContextFromToken(token?: string | null): AuthContext | null {
  if (isAuthBypassed()) return ensureDevAuthContext()
  if (!token) return null

  const database = getDb()
  const session = database.prepare(`
    SELECT * FROM auth_sessions
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
  `).get(hashToken(token), nowIso()) as { user_id: string; workspace_id: string } | undefined
  if (!session) return null

  database.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').run(nowIso(), hashToken(token))
  const user = database.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow | undefined
  const workspace = database.prepare('SELECT * FROM workspaces WHERE id = ?').get(session.workspace_id) as WorkspaceRow | undefined
  const membership = database.prepare(`
    SELECT * FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?
  `).get(session.workspace_id, session.user_id) as MembershipRow | undefined

  if (!user || !workspace || !membership) return null
  return {
    user: toAuthUser(user),
    workspace: toWorkspace(workspace, membership.role),
    isDevBypass: false,
  }
}

export function getAuthContext(request: NextRequest): AuthContext | null {
  return getAuthContextFromToken(request.cookies.get(SESSION_COOKIE)?.value)
}

export function requireAuth(request: NextRequest): AuthContext | NextResponse {
  const auth = getAuthContext(request)
  if (auth) return auth
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
}

export function createWalletNonce(walletAddress: string, origin: string) {
  const normalized = walletAddress.toLowerCase()
  const nonce = randomToken(16)
  const issuedAt = nowIso()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const message = [
    'Sign in to Slicer',
    '',
    `Domain: ${new URL(origin).host}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')

  getDb().prepare(`
    INSERT INTO wallet_nonces (wallet_address, nonce, message, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      nonce = excluded.nonce,
      message = excluded.message,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at
  `).run(normalized, nonce, message, issuedAt, expiresAt)

  return { walletAddress, nonce, message, expiresAt }
}

export function getWalletNonce(walletAddress: string) {
  return getDb().prepare(`
    SELECT * FROM wallet_nonces WHERE wallet_address = ? AND expires_at > ?
  `).get(walletAddress.toLowerCase(), nowIso()) as { wallet_address: string; nonce: string; message: string; expires_at: string } | undefined
}

export function consumeWalletNonce(walletAddress: string) {
  getDb().prepare('DELETE FROM wallet_nonces WHERE wallet_address = ?').run(walletAddress.toLowerCase())
}
