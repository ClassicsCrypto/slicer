import 'server-only'

import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

import type { JobInputKind, JobProgress } from '@/types'
import { DATA_DIR, DB_PATH } from '@/lib/data-dir'

const LOG_DIR = path.join(DATA_DIR, '..', 'logs')
const PARITY_LOG_PATH = path.join(LOG_DIR, 'sqlite-shadow-parity.jsonl')
const COMPLETE_RETENTION_DAYS = Number(process.env.SLICER_JOB_RETENTION_DAYS || 7)
const FAILED_RETENTION_HOURS = Number(process.env.SLICER_FAILED_RETENTION_HOURS || 48)
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001'

type ShadowJobRow = {
  id: string
  user_id: string
  title: string
  status: string
  input_kind: string
  raw_input_url: string | null
  source_url: string | null
  source_path: string | null
  source_cache_key: string | null
  options_json: string
  progress_json: string
  created_at: string
  updated_at: string
  completed_at: string | null
  expires_at: string | null
  last_accessed_at: string | null
  deleted_at: string | null
}

type ComparableShadowJob = {
  id: string
  user_id: string
  title: string
  status: string
  input_kind: string
  raw_input_url: string | null
  source_url: string | null
  source_path: string | null
  source_cache_key: string | null
  options: Record<string, any>
  progress: Record<string, any>
  created_at: string
  updated_at: string
  completed_at: string | null
  expires_at: string | null
}

export type ShadowParityMismatch = {
  field: keyof ComparableShadowJob | 'shadow_row'
  expected: unknown
  actual: unknown
}

export type ShadowParityResult = {
  ok: boolean
  jobId: string
  mismatches: ShadowParityMismatch[]
  expected: ComparableShadowJob
  actual: ComparableShadowJob | null
}

export type ShadowDeleteParityResult = {
  ok: boolean
  jobId: string
  actual: ComparableShadowJob | null
}

let db: Database.Database | null = null

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function getDb() {
  if (db) return db

  ensureDir(DATA_DIR)
  if (!fs.existsSync(DB_PATH)) {
    console.warn(`[job-store] Creating a NEW empty SQLite database at ${DB_PATH} — if you expected existing data, SLICER_DATA_DIR points at the wrong place.`)
  }
  console.log(`[job-store] opening ${DB_PATH}`)
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
    CREATE INDEX IF NOT EXISTS idx_jobs_user_created ON jobs(user_id, created_at DESC);
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

function parseServeFileName(sourceUrl?: string | null) {
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

function resolveSourcePath(sourceUrl?: string | null) {
  const fileName = parseServeFileName(sourceUrl)
  if (!fileName) return null
  return path.join(process.cwd(), 'server', 'temp', fileName)
}

function inferInputKind(job: any): JobInputKind {
  const explicit = job?.progress?.inputKind
  if (explicit === 'remote_url' || explicit === 'uploaded_file' || explicit === 'rescore') return explicit
  if (job?.progress?.rawInputUrl) return 'remote_url'
  return 'uploaded_file'
}

function computeExpiry(status: string, progress: JobProgress, updatedAt: string, createdAt: string) {
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

function toShadowRow(job: any): ShadowJobRow {
  const nowIso = new Date().toISOString()
  const progress = (job?.progress ?? {}) as JobProgress
  const createdAt = job?.created_at || nowIso
  const updatedAt = job?.updated_at || nowIso
  const inputKind = inferInputKind(job)

  return {
    id: String(job.id),
    user_id: String(job.user_id || DEFAULT_USER_ID),
    title: String(job.title || 'Untitled Video'),
    status: String(job.status || 'processing'),
    input_kind: inputKind,
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

function sortObjectDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortObjectDeep(item))
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortObjectDeep(nested)])
    return Object.fromEntries(entries)
  }
  return value
}

function stableSerialize(value: unknown) {
  return JSON.stringify(sortObjectDeep(value))
}

function normalizeComparableProgress(progress: Record<string, any>) {
  return {
    ...progress,
    completedClips: Array.isArray(progress?.completedClips) ? progress.completedClips : [],
  }
}

function toComparableShadowJobFromRow(row: ShadowJobRow | undefined): ComparableShadowJob | null {
  if (!row) return null
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    status: row.status,
    input_kind: row.input_kind,
    raw_input_url: row.raw_input_url,
    source_url: row.source_url,
    source_path: row.source_path,
    source_cache_key: row.source_cache_key,
    options: JSON.parse(row.options_json || '{}'),
    progress: normalizeComparableProgress(JSON.parse(row.progress_json || '{}')),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
  }
}

function toComparableShadowJob(job: any): ComparableShadowJob {
  const row = toShadowRow(job)
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    status: row.status,
    input_kind: row.input_kind,
    raw_input_url: row.raw_input_url,
    source_url: row.source_url,
    source_path: row.source_path,
    source_cache_key: row.source_cache_key,
    options: JSON.parse(row.options_json || '{}'),
    progress: normalizeComparableProgress(JSON.parse(row.progress_json || '{}')),
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
  }
}

function diffComparableShadowJobs(expected: ComparableShadowJob, actual: ComparableShadowJob | null): ShadowParityMismatch[] {
  if (!actual) {
    return [{ field: 'shadow_row', expected: 'present', actual: null }]
  }

  const fields = Object.keys(expected) as Array<keyof ComparableShadowJob>
  return fields.flatMap((field) => {
    if (stableSerialize(expected[field]) === stableSerialize(actual[field])) return []
    return [{ field, expected: expected[field], actual: actual[field] }]
  })
}

function appendParityLog(entry: Record<string, unknown>) {
  ensureDir(LOG_DIR)
  fs.appendFileSync(PARITY_LOG_PATH, `${JSON.stringify({ loggedAt: new Date().toISOString(), ...entry })}\n`)
}

function getShadowJobRow(jobId: string) {
  return getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as ShadowJobRow | undefined
}

function fromShadowRow(row: ShadowJobRow | undefined) {
  if (!row) return null
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    status: row.status,
    source_url: row.source_url || '',
    source_path: row.source_path,
    options: JSON.parse(row.options_json || '{}'),
    progress: JSON.parse(row.progress_json || '{}'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function isSqliteShadowEnabled() {
  return process.env.SLICER_SHADOW_SQLITE !== 'false'
}

export function upsertShadowJob(job: any) {
  if (!isSqliteShadowEnabled() || !job?.id) return

  const row = toShadowRow(job)
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

export function upsertShadowJobs(jobs: any[]) {
  for (const job of jobs ?? []) upsertShadowJob(job)
}

export function deleteShadowJob(jobId: string) {
  if (!isSqliteShadowEnabled() || !jobId) return
  getDb().prepare('DELETE FROM jobs WHERE id = ?').run(jobId)
}

export function verifyShadowJobParity(job: any, context?: { source?: string; action?: string }): ShadowParityResult {
  const expected = toComparableShadowJob(job)
  const actual = toComparableShadowJobFromRow(getShadowJobRow(expected.id))
  const mismatches = diffComparableShadowJobs(expected, actual)
  const result: ShadowParityResult = {
    ok: mismatches.length === 0,
    jobId: expected.id,
    mismatches,
    expected,
    actual,
  }

  if (!result.ok) {
    appendParityLog({
      type: 'job_parity_mismatch',
      source: context?.source || 'unknown',
      action: context?.action || 'upsert',
      jobId: expected.id,
      mismatches,
    })
  }

  return result
}

export function verifyShadowJobDeleted(jobId: string, context?: { source?: string; action?: string }): ShadowDeleteParityResult {
  const actual = toComparableShadowJobFromRow(getShadowJobRow(jobId))
  const result: ShadowDeleteParityResult = {
    ok: !actual,
    jobId,
    actual,
  }

  if (!result.ok) {
    appendParityLog({
      type: 'job_delete_mismatch',
      source: context?.source || 'unknown',
      action: context?.action || 'delete',
      jobId,
      actual,
    })
  }

  return result
}

export function getShadowJob(jobId: string) {
  return fromShadowRow(getShadowJobRow(jobId))
}

export type ShadowJob = NonNullable<ReturnType<typeof getShadowJob>>

/**
 * Transactional read-merge-write. The mutator runs inside BEGIN IMMEDIATE so
 * no other writer (this process or server/youtube-api.js — both open the same
 * DB file) can interleave between the fresh read and the upsert.
 * Mutators MUST be synchronous (better-sqlite3 rejects async transaction
 * functions) and may return null/undefined to skip the write entirely.
 * Returns the fresh row after the transaction, or null if the job is gone.
 */
export function mutateShadowJob(jobId: string, mutator: (job: ShadowJob) => Record<string, any> | null | undefined) {
  const tx = getDb().transaction((id: string) => {
    const job = getShadowJob(id)
    if (!job) return null
    const next = mutator(job)
    if (next) upsertShadowJob(next)
    return getShadowJob(id)
  })
  try {
    return tx.immediate(jobId)
  } catch (error: any) {
    // One retry on busy: WAL allows a single writer; a competing immediate
    // transaction in the other process can momentarily hold the lock.
    if (error?.code === 'SQLITE_BUSY') return tx.immediate(jobId)
    throw error
  }
}

export function listShadowJobs(limit = 50) {
  const rows = getDb().prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?').all(limit) as ShadowJobRow[]
  return rows.map((row) => fromShadowRow(row))
}

export function listShadowJobsForUsers(userIds: string[], limit = 50) {
  if (!userIds.length) return []
  const placeholders = userIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(`SELECT * FROM jobs WHERE user_id IN (${placeholders}) ORDER BY created_at DESC LIMIT ?`)
    .all(...userIds, limit) as ShadowJobRow[]
  return rows.map((row) => fromShadowRow(row))
}

export function getShadowJobCount() {
  const row = getDb().prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number }
  return row?.count || 0
}

export function getShadowDbPath() {
  return DB_PATH
}

export function getShadowParityLogPath() {
  return PARITY_LOG_PATH
}
