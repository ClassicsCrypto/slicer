const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH = path.join(DATA_DIR, 'slicer.sqlite')
const COMPLETE_RETENTION_DAYS = Number(process.env.SLICER_JOB_RETENTION_DAYS || 7)
const FAILED_RETENTION_HOURS = Number(process.env.SLICER_FAILED_RETENTION_HOURS || 48)
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

let db = null

function getDb() {
  if (db) return db
  fs.mkdirSync(DATA_DIR, { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
      title TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processing', 'complete', 'failed')),
      input_kind TEXT NOT NULL CHECK (input_kind IN ('remote_url', 'uploaded_file', 'rescore')),
      raw_input_url TEXT,
      source_url TEXT,
      source_path TEXT,
      source_cache_key TEXT,
      options_json TEXT NOT NULL,
      progress_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      expires_at TEXT,
      last_accessed_at TEXT,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_source_cache_key ON jobs(source_cache_key);
    CREATE TABLE IF NOT EXISTS source_cache (
      cache_key TEXT PRIMARY KEY,
      original_url TEXT NOT NULL,
      local_path TEXT NOT NULL,
      transcript_path TEXT,
      duration_sec INTEGER DEFAULT 0,
      mime_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_source_cache_expires_at ON source_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_source_cache_last_used_at ON source_cache(last_used_at DESC);
  `)
  return db
}

function isSqliteShadowEnabled() {
  return process.env.SLICER_SHADOW_SQLITE !== 'false'
}

function parseServeFileName(sourceUrl) {
  if (typeof sourceUrl !== 'string' || !sourceUrl.includes('/serve/')) return null
  try {
    const parsed = new URL(sourceUrl)
    const parts = parsed.pathname.split('/serve/')
    return parts[1] ? decodeURIComponent(parts[1]) : null
  } catch {
    const parts = sourceUrl.split('/serve/')
    return parts[1] ? decodeURIComponent(parts[1].split('?')[0]) : null
  }
}

function resolveSourcePath(sourceUrl) {
  const fileName = parseServeFileName(sourceUrl)
  if (!fileName) return null
  return path.join(__dirname, '..', 'temp', fileName)
}

function inferInputKind(job) {
  const explicit = job?.progress?.inputKind
  if (explicit === 'remote_url' || explicit === 'uploaded_file' || explicit === 'rescore') return explicit
  if (job?.progress?.rawInputUrl) return 'remote_url'
  return 'uploaded_file'
}

function computeExpiry(status, progress, updatedAt, createdAt) {
  const anchorIso = progress?.completedAt || updatedAt || createdAt
  const anchorMs = anchorIso ? new Date(anchorIso).getTime() : Number.NaN
  if (!Number.isFinite(anchorMs)) return null

  if (status === 'complete') {
    return new Date(anchorMs + COMPLETE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  }
  if (status === 'failed') {
    return new Date(anchorMs + FAILED_RETENTION_HOURS * 60 * 60 * 1000).toISOString()
  }
  return null
}

function toRow(job) {
  const nowIso = new Date().toISOString()
  const progress = job?.progress || {}
  const createdAt = job?.created_at || nowIso
  const updatedAt = job?.updated_at || nowIso

  return {
    id: String(job.id),
    user_id: String(job.user_id || DEFAULT_USER_ID),
    title: String(job.title || 'Untitled Video'),
    status: String(job.status || 'processing'),
    input_kind: inferInputKind(job),
    raw_input_url: typeof progress.rawInputUrl === 'string' ? progress.rawInputUrl : null,
    source_url: typeof job.source_url === 'string' ? job.source_url : null,
    source_path: resolveSourcePath(job.source_url),
    source_cache_key: typeof progress.transcriptionCacheKey === 'string' ? progress.transcriptionCacheKey : null,
    options_json: JSON.stringify(job.options || {}),
    progress_json: JSON.stringify(progress),
    created_at: createdAt,
    updated_at: updatedAt,
    completed_at: progress.completedAt || null,
    expires_at: computeExpiry(String(job.status || 'processing'), progress, updatedAt, createdAt),
    last_accessed_at: nowIso,
    deleted_at: null,
  }
}

function upsertShadowJob(job) {
  if (!isSqliteShadowEnabled() || !job?.id) return
  const row = toRow(job)
  getDb().prepare(`
    INSERT INTO jobs (
      id, user_id, title, status, input_kind, raw_input_url, source_url, source_path,
      source_cache_key, options_json, progress_json, created_at, updated_at, completed_at,
      expires_at, last_accessed_at, deleted_at
    ) VALUES (
      @id, @user_id, @title, @status, @input_kind, @raw_input_url, @source_url, @source_path,
      @source_cache_key, @options_json, @progress_json, @created_at, @updated_at, @completed_at,
      @expires_at, @last_accessed_at, @deleted_at
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      title = excluded.title,
      status = excluded.status,
      input_kind = excluded.input_kind,
      raw_input_url = excluded.raw_input_url,
      source_url = excluded.source_url,
      source_path = excluded.source_path,
      source_cache_key = excluded.source_cache_key,
      options_json = excluded.options_json,
      progress_json = excluded.progress_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      completed_at = excluded.completed_at,
      expires_at = excluded.expires_at,
      last_accessed_at = excluded.last_accessed_at,
      deleted_at = excluded.deleted_at
  `).run(row)
}

function deleteShadowJob(jobId) {
  if (!isSqliteShadowEnabled() || !jobId) return
  getDb().prepare('DELETE FROM jobs WHERE id = ?').run(jobId)
}

function getShadowJob(jobId) {
  return getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(jobId)
}

function listShadowJobs(limit = 50) {
  return getDb().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit)
}

module.exports = {
  DB_PATH,
  isSqliteShadowEnabled,
  upsertShadowJob,
  deleteShadowJob,
  getShadowJob,
  listShadowJobs,
}
