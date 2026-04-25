import path from 'path'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { AutoclipSubscription, AutoclipSubscriptionInput, AutoclipSubscriptionStatus } from '@/types/autoclip'

const DB_PATH = path.join(process.cwd(), 'server', 'data', 'slicer.sqlite')
let db: Database.Database | null = null

function getDb() {
  if (db) return db
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS autoclip_subscriptions (
      id TEXT PRIMARY KEY,
      owner_name TEXT,
      owner_email TEXT,
      platform TEXT NOT NULL CHECK (platform IN ('twitch', 'youtube', 'x', 'direct')),
      handle TEXT,
      channel_url TEXT,
      title TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'paused')) DEFAULT 'active',
      options_json TEXT NOT NULL DEFAULT '{}',
      last_checked_at TEXT,
      last_seen_stream_id TEXT,
      last_job_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_autoclip_status ON autoclip_subscriptions(status);
    CREATE INDEX IF NOT EXISTS idx_autoclip_platform_handle ON autoclip_subscriptions(platform, handle);
  `)
  return db
}

function normalizeRow(row: any): AutoclipSubscription {
  return {
    id: row.id,
    ownerName: row.owner_name ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
    platform: row.platform,
    handle: row.handle ?? undefined,
    channelUrl: row.channel_url ?? undefined,
    title: row.title ?? undefined,
    status: row.status,
    options: JSON.parse(row.options_json || '{}'),
    lastCheckedAt: row.last_checked_at,
    lastSeenStreamId: row.last_seen_stream_id,
    lastJobId: row.last_job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function cleanInput(input: AutoclipSubscriptionInput) {
  const platform = input.platform
  if (!['twitch', 'youtube', 'x', 'direct'].includes(platform)) {
    throw new Error('Unsupported platform')
  }
  const handle = input.handle?.trim().replace(/^@/, '') || undefined
  const channelUrl = input.channelUrl?.trim() || undefined
  if (!handle && !channelUrl) throw new Error('handle or channelUrl is required')

  return {
    ownerName: input.ownerName?.trim() || undefined,
    ownerEmail: input.ownerEmail?.trim() || undefined,
    platform,
    handle,
    channelUrl,
    title: input.title?.trim() || `${platform}:${handle || channelUrl}`,
    options: input.options && typeof input.options === 'object' ? input.options : {},
  }
}

export function listAutoclipSubscriptions(status?: AutoclipSubscriptionStatus) {
  const database = getDb()
  const rows = status
    ? database.prepare('SELECT * FROM autoclip_subscriptions WHERE status = ? ORDER BY created_at DESC').all(status)
    : database.prepare('SELECT * FROM autoclip_subscriptions ORDER BY created_at DESC').all()
  return rows.map(normalizeRow)
}

export function getAutoclipSubscription(id: string) {
  const row = getDb().prepare('SELECT * FROM autoclip_subscriptions WHERE id = ?').get(id)
  return row ? normalizeRow(row) : null
}

export function createAutoclipSubscription(input: AutoclipSubscriptionInput) {
  const clean = cleanInput(input)
  const now = new Date().toISOString()
  const row = {
    id: uuidv4(),
    owner_name: clean.ownerName ?? null,
    owner_email: clean.ownerEmail ?? null,
    platform: clean.platform,
    handle: clean.handle ?? null,
    channel_url: clean.channelUrl ?? null,
    title: clean.title ?? null,
    status: 'active',
    options_json: JSON.stringify(clean.options),
    last_checked_at: null,
    last_seen_stream_id: null,
    last_job_id: null,
    created_at: now,
    updated_at: now,
  }
  getDb().prepare(`
    INSERT INTO autoclip_subscriptions (
      id, owner_name, owner_email, platform, handle, channel_url, title, status,
      options_json, last_checked_at, last_seen_stream_id, last_job_id, created_at, updated_at
    ) VALUES (
      @id, @owner_name, @owner_email, @platform, @handle, @channel_url, @title, @status,
      @options_json, @last_checked_at, @last_seen_stream_id, @last_job_id, @created_at, @updated_at
    )
  `).run(row)
  return getAutoclipSubscription(row.id)!
}

export function updateAutoclipSubscription(id: string, patch: Partial<AutoclipSubscriptionInput> & {
  status?: AutoclipSubscriptionStatus
  lastCheckedAt?: string | null
  lastSeenStreamId?: string | null
  lastJobId?: string | null
}) {
  const existing = getAutoclipSubscription(id)
  if (!existing) return null
  const next = {
    ...existing,
    ...patch,
    options: patch.options && typeof patch.options === 'object' ? patch.options : existing.options,
  }
  const clean = cleanInput(next as AutoclipSubscriptionInput)
  const status = patch.status || existing.status
  if (!['active', 'paused'].includes(status)) throw new Error('Unsupported status')
  const now = new Date().toISOString()

  getDb().prepare(`
    UPDATE autoclip_subscriptions SET
      owner_name = @owner_name,
      owner_email = @owner_email,
      platform = @platform,
      handle = @handle,
      channel_url = @channel_url,
      title = @title,
      status = @status,
      options_json = @options_json,
      last_checked_at = @last_checked_at,
      last_seen_stream_id = @last_seen_stream_id,
      last_job_id = @last_job_id,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    owner_name: clean.ownerName ?? null,
    owner_email: clean.ownerEmail ?? null,
    platform: clean.platform,
    handle: clean.handle ?? null,
    channel_url: clean.channelUrl ?? null,
    title: clean.title ?? null,
    status,
    options_json: JSON.stringify(clean.options),
    last_checked_at: patch.lastCheckedAt === undefined ? existing.lastCheckedAt ?? null : patch.lastCheckedAt,
    last_seen_stream_id: patch.lastSeenStreamId === undefined ? existing.lastSeenStreamId ?? null : patch.lastSeenStreamId,
    last_job_id: patch.lastJobId === undefined ? existing.lastJobId ?? null : patch.lastJobId,
    updated_at: now,
  })

  return getAutoclipSubscription(id)
}

export function deleteAutoclipSubscription(id: string) {
  const result = getDb().prepare('DELETE FROM autoclip_subscriptions WHERE id = ?').run(id)
  return result.changes > 0
}
