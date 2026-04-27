import path from 'path'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import { AutoclipSubscription, AutoclipSubscriptionInput, AutoclipSubscriptionStatus } from '@/types/autoclip'

const DB_PATH = path.join(process.cwd(), 'server', 'data', 'slicer.sqlite')
let db: Database.Database | null = null

export type AutoclipScope = {
  userId?: string
  workspaceId?: string
}

export type AutoclipSubscriptionWithSharing = AutoclipSubscription & {
  sharedClipperCount: number
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((entry) => entry.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function getDb() {
  if (db) return db
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS autoclip_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      workspace_id TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_autoclip_workspace_status ON autoclip_subscriptions(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_autoclip_user_status ON autoclip_subscriptions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_autoclip_platform_handle ON autoclip_subscriptions(platform, handle);
    CREATE TABLE IF NOT EXISTS autoclip_events (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      workspace_id TEXT,
      subscription_id TEXT,
      creator_key TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      platform TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      title TEXT,
      job_id TEXT,
      detected_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_autoclip_events_fingerprint ON autoclip_events(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_autoclip_events_workspace_fingerprint ON autoclip_events(workspace_id, fingerprint);
    CREATE INDEX IF NOT EXISTS idx_autoclip_events_subscription_detected ON autoclip_events(subscription_id, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_autoclip_events_creator_detected ON autoclip_events(creator_key, detected_at DESC);
  `)
  ensureColumn(db, 'autoclip_subscriptions', 'user_id', 'TEXT')
  ensureColumn(db, 'autoclip_subscriptions', 'workspace_id', 'TEXT')
  ensureColumn(db, 'autoclip_events', 'user_id', 'TEXT')
  ensureColumn(db, 'autoclip_events', 'workspace_id', 'TEXT')
  ensureColumn(db, 'autoclip_events', 'subscription_id', 'TEXT')
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_autoclip_workspace_status ON autoclip_subscriptions(workspace_id, status);
    CREATE INDEX IF NOT EXISTS idx_autoclip_user_status ON autoclip_subscriptions(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_autoclip_events_workspace_fingerprint ON autoclip_events(workspace_id, fingerprint);
    CREATE INDEX IF NOT EXISTS idx_autoclip_events_subscription_detected ON autoclip_events(subscription_id, detected_at DESC);
  `)
  return db
}

function normalizeRow(row: any): AutoclipSubscription {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    workspaceId: row.workspace_id ?? undefined,
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

function scopeWhere(scope?: AutoclipScope) {
  if (scope?.workspaceId) return { clause: 'workspace_id = @workspace_id', params: { workspace_id: scope.workspaceId } }
  if (scope?.userId) return { clause: 'user_id = @user_id', params: { user_id: scope.userId } }
  return { clause: '1 = 1', params: {} }
}

function cleanInput(input: AutoclipSubscriptionInput) {
  const platform = input.platform
  if (!['twitch', 'youtube', 'x', 'direct'].includes(platform)) {
    throw new Error('Unsupported platform')
  }
  const handle = input.handle?.trim().replace(/^@/, '').toLowerCase() || undefined
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

export function listAutoclipSubscriptions(status?: AutoclipSubscriptionStatus, scope?: AutoclipScope) {
  const database = getDb()
  const scoped = scopeWhere(scope)
  const rows = status
    ? database.prepare(`SELECT * FROM autoclip_subscriptions WHERE ${scoped.clause} AND status = @status ORDER BY created_at DESC`).all({ ...scoped.params, status })
    : database.prepare(`SELECT * FROM autoclip_subscriptions WHERE ${scoped.clause} ORDER BY created_at DESC`).all(scoped.params)
  return rows.map(normalizeRow)
}

export function getAutoclipSubscription(id: string, scope?: AutoclipScope) {
  const scoped = scopeWhere(scope)
  const row = getDb().prepare(`SELECT * FROM autoclip_subscriptions WHERE id = @id AND ${scoped.clause}`).get({ id, ...scoped.params })
  return row ? normalizeRow(row) : null
}

export function countOtherAutoclippers(subscription: Pick<AutoclipSubscription, 'id' | 'platform' | 'handle' | 'channelUrl'>, scope?: AutoclipScope) {
  const handle = subscription.handle?.trim().replace(/^@/, '').toLowerCase() || null
  const channelUrl = subscription.channelUrl?.trim().toLowerCase() || null
  const workspaceId = scope?.workspaceId || null
  const userId = scope?.userId || null

  const row = getDb().prepare(`
    SELECT COUNT(DISTINCT COALESCE(workspace_id, user_id, id)) AS count
    FROM autoclip_subscriptions
    WHERE status = 'active'
      AND id != @id
      AND platform = @platform
      AND (
        (@handle IS NOT NULL AND lower(COALESCE(handle, '')) = @handle)
        OR (@channel_url IS NOT NULL AND lower(COALESCE(channel_url, '')) = @channel_url)
      )
      AND (
        (@workspace_id IS NOT NULL AND COALESCE(workspace_id, '') != @workspace_id)
        OR (@workspace_id IS NULL AND @user_id IS NOT NULL AND COALESCE(user_id, '') != @user_id)
        OR (@workspace_id IS NULL AND @user_id IS NULL)
      )
  `).get({
    id: subscription.id,
    platform: subscription.platform,
    handle,
    channel_url: channelUrl,
    workspace_id: workspaceId,
    user_id: userId,
  }) as { count?: number } | undefined

  return Number(row?.count || 0)
}

export function withAutoclipSharing(subscription: AutoclipSubscription, scope?: AutoclipScope): AutoclipSubscriptionWithSharing {
  return {
    ...subscription,
    sharedClipperCount: countOtherAutoclippers(subscription, scope),
  }
}

export function createAutoclipSubscription(input: AutoclipSubscriptionInput, scope?: AutoclipScope) {
  const clean = cleanInput(input)
  const now = new Date().toISOString()
  const row = {
    id: uuidv4(),
    user_id: scope?.userId ?? input.userId ?? null,
    workspace_id: scope?.workspaceId ?? input.workspaceId ?? null,
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
      id, user_id, workspace_id, owner_name, owner_email, platform, handle, channel_url, title, status,
      options_json, last_checked_at, last_seen_stream_id, last_job_id, created_at, updated_at
    ) VALUES (
      @id, @user_id, @workspace_id, @owner_name, @owner_email, @platform, @handle, @channel_url, @title, @status,
      @options_json, @last_checked_at, @last_seen_stream_id, @last_job_id, @created_at, @updated_at
    )
  `).run(row)
  return getAutoclipSubscription(row.id, scope)!
}

export function updateAutoclipSubscription(id: string, patch: Partial<AutoclipSubscriptionInput> & {
  status?: AutoclipSubscriptionStatus
  lastCheckedAt?: string | null
  lastSeenStreamId?: string | null
  lastJobId?: string | null
}, scope?: AutoclipScope) {
  const existing = getAutoclipSubscription(id, scope)
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
      user_id = @user_id,
      workspace_id = @workspace_id,
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
    user_id: scope?.userId ?? existing.userId ?? patch.userId ?? null,
    workspace_id: scope?.workspaceId ?? existing.workspaceId ?? patch.workspaceId ?? null,
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

  return getAutoclipSubscription(id, scope)
}

export function deleteAutoclipSubscription(id: string, scope?: AutoclipScope) {
  const scoped = scopeWhere(scope)
  const result = getDb().prepare(`DELETE FROM autoclip_subscriptions WHERE id = @id AND ${scoped.clause}`).run({ id, ...scoped.params })
  return result.changes > 0
}

function normalizeTitleForFingerprint(title: string) {
  return String(title || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(live|stream|streaming|vod|broadcast|part\s*\d+)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function getCreatorKey(input: { ownerEmail?: string; ownerName?: string; handle?: string; channelUrl?: string }) {
  return String(input.ownerEmail || input.ownerName || input.handle || input.channelUrl || 'unknown')
    .toLowerCase()
    .replace(/^@/, '')
    .trim()
}

function getTimeBucket(publishedAt?: string | null) {
  const ms = publishedAt ? new Date(publishedAt).getTime() : Date.now()
  const bucketMs = 3 * 60 * 60 * 1000
  return Math.floor((Number.isFinite(ms) ? ms : Date.now()) / bucketMs)
}

export function buildAutoclipFingerprint(input: { creatorKey: string; title?: string; publishedAt?: string | null }) {
  return `${input.creatorKey}:${getTimeBucket(input.publishedAt)}:${normalizeTitleForFingerprint(input.title || '')}`
}

function eventScopeWhere(scope?: AutoclipScope) {
  if (scope?.workspaceId) return { clause: 'autoclip_events.workspace_id = @workspace_id', params: { workspace_id: scope.workspaceId } }
  if (scope?.userId) return { clause: 'autoclip_events.user_id = @user_id', params: { user_id: scope.userId } }
  return { clause: '1 = 1', params: {} }
}

export function findAutoclipDuplicate(input: { creatorKey: string; fingerprint: string; publishedAt?: string | null }, scope?: AutoclipScope) {
  const bucket = getTimeBucket(input.publishedAt)
  const minDate = new Date((bucket - 1) * 3 * 60 * 60 * 1000).toISOString()
  const maxDate = new Date((bucket + 2) * 3 * 60 * 60 * 1000).toISOString()
  const scoped = eventScopeWhere(scope)
  const row = getDb().prepare(`
    SELECT autoclip_events.*
    FROM autoclip_events
    LEFT JOIN jobs ON jobs.id = autoclip_events.job_id
    WHERE autoclip_events.creator_key = @creator_key
      AND ${scoped.clause}
      AND (autoclip_events.fingerprint = @fingerprint OR autoclip_events.detected_at BETWEEN @minDate AND @maxDate)
      AND (autoclip_events.job_id IS NULL OR jobs.id IS NULL OR jobs.status != 'failed')
    ORDER BY autoclip_events.created_at DESC
    LIMIT 1
  `).get({ creator_key: input.creatorKey, fingerprint: input.fingerprint, minDate, maxDate, ...scoped.params })
  return row || null
}

export function recordAutoclipEvent(input: {
  userId?: string
  workspaceId?: string
  subscriptionId?: string
  creatorKey: string
  fingerprint: string
  platform: string
  sourceId: string
  sourceUrl: string
  title?: string
  jobId?: string
  detectedAt?: string
}) {
  const now = new Date().toISOString()
  const row = {
    id: uuidv4(),
    user_id: input.userId || null,
    workspace_id: input.workspaceId || null,
    subscription_id: input.subscriptionId || null,
    creator_key: input.creatorKey,
    fingerprint: input.fingerprint,
    platform: input.platform,
    source_id: input.sourceId,
    source_url: input.sourceUrl,
    title: input.title || null,
    job_id: input.jobId || null,
    detected_at: input.detectedAt || now,
    created_at: now,
  }
  getDb().prepare(`
    INSERT INTO autoclip_events (
      id, user_id, workspace_id, subscription_id, creator_key, fingerprint, platform,
      source_id, source_url, title, job_id, detected_at, created_at
    ) VALUES (
      @id, @user_id, @workspace_id, @subscription_id, @creator_key, @fingerprint, @platform,
      @source_id, @source_url, @title, @job_id, @detected_at, @created_at
    )
  `).run(row)
  return row
}

export function getAutoclipCreatorKey(subscription: AutoclipSubscription) {
  return getCreatorKey(subscription)
}
