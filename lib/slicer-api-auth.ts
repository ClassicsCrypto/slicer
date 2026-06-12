import 'server-only'

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { NextRequest, NextResponse } from 'next/server'
import { DATA_DIR, DB_PATH } from '@/lib/data-dir'

const KEY_PREFIX = 'sk_slicer_'
const DEFAULT_SCOPES = ['jobs:read', 'clips:read', 'clips:export']

export type ApiKeyRecord = {
  id: string
  workspaceId: string
  createdByUserId: string
  name: string
  keyPrefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type SlicerApiAuth = {
  keyId: string
  workspaceId: string
  createdByUserId: string
  scopes: string[]
  workspaceUserIds: string[]
}

let db: Database.Database | null = null

function getDb() {
  if (db) return db
  fs.mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
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
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id, revoked_at);
  `)
  return db
}

function nowIso() {
  return new Date().toISOString()
}

function hashKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

function toRecord(row: any): ApiKeyRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: JSON.parse(row.scopes_json || '[]'),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}

export function listApiKeys(workspaceId: string) {
  return getDb().prepare(`
    SELECT * FROM api_keys
    WHERE workspace_id = ?
    ORDER BY created_at DESC
  `).all(workspaceId).map(toRecord)
}

export function createApiKey(input: { workspaceId: string; createdByUserId: string; name: string; scopes?: string[] }) {
  const token = `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
  const id = crypto.randomUUID()
  const ts = nowIso()
  const scopes = input.scopes?.length ? input.scopes : DEFAULT_SCOPES
  const keyPrefix = `${token.slice(0, 16)}...`

  getDb().prepare(`
    INSERT INTO api_keys (id, workspace_id, created_by_user_id, name, key_hash, key_prefix, scopes_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.workspaceId, input.createdByUserId, input.name.trim() || 'Slicer API Key', hashKey(token), keyPrefix, JSON.stringify(scopes), ts)

  return { key: token, record: toRecord(getDb().prepare('SELECT * FROM api_keys WHERE id = ?').get(id)) }
}

export function revokeApiKey(workspaceId: string, keyId: string) {
  const result = getDb().prepare(`
    UPDATE api_keys SET revoked_at = ?
    WHERE id = ? AND workspace_id = ? AND revoked_at IS NULL
  `).run(nowIso(), keyId, workspaceId)
  return result.changes > 0
}

export function getWorkspaceUserIds(workspaceId: string) {
  const rows = getDb().prepare(`
    SELECT user_id FROM workspace_memberships WHERE workspace_id = ?
  `).all(workspaceId) as Array<{ user_id: string }>
  return rows.map((row) => row.user_id)
}

function bearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export function requireSlicerApiAuth(request: NextRequest, requiredScope: string): SlicerApiAuth | NextResponse {
  const token = bearerToken(request)
  if (!token || !token.startsWith(KEY_PREFIX)) {
    return NextResponse.json({ error: 'Missing Slicer API bearer token' }, { status: 401 })
  }

  const row = getDb().prepare(`
    SELECT * FROM api_keys
    WHERE key_hash = ? AND revoked_at IS NULL
  `).get(hashKey(token)) as any

  if (!row) return NextResponse.json({ error: 'Invalid Slicer API key' }, { status: 401 })

  const scopes = JSON.parse(row.scopes_json || '[]') as string[]
  if (!scopes.includes(requiredScope) && !(requiredScope === 'clips:export' && scopes.includes('clips:read'))) {
    return NextResponse.json({ error: `API key missing scope: ${requiredScope}` }, { status: 403 })
  }

  getDb().prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(nowIso(), row.id)

  const workspaceUserIds = getWorkspaceUserIds(row.workspace_id)
  if (!workspaceUserIds.length) workspaceUserIds.push(row.created_by_user_id)

  return {
    keyId: row.id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    scopes,
    workspaceUserIds,
  }
}
