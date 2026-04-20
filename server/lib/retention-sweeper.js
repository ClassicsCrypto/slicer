const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const sqliteShadowStore = require('./sqlite-shadow-store.js')

const COMPLETE_RETENTION_DAYS = Number(process.env.SLICER_JOB_RETENTION_DAYS || 7)
const FAILED_RETENTION_HOURS = Number(process.env.SLICER_FAILED_RETENTION_HOURS || 48)
const SOURCE_CACHE_RETENTION_DAYS = Number(process.env.SLICER_SOURCE_CACHE_RETENTION_DAYS || 7)
const EXPORT_TEMP_RETENTION_HOURS = Number(process.env.SLICER_EXPORT_RETENTION_HOURS || 12)
const CACHE_WARNING_GB = Number(process.env.SLICER_CACHE_WARNING_GB || 8)
const CACHE_HARD_CAP_GB = Number(process.env.SLICER_CACHE_HARD_CAP_GB || 10)
const LOW_DISK_WARNING_GB = Number(process.env.SLICER_LOW_DISK_WARNING_GB || 20)
const LOW_DISK_HARD_STOP_GB = Number(process.env.SLICER_LOW_DISK_HARD_STOP_GB || 10)

const SERVER_DIR = path.join(__dirname, '..')
const TEMP_DIR = path.join(SERVER_DIR, 'temp')
const DATA_DIR = path.join(SERVER_DIR, 'data')
const REPORT_DIR = path.join(SERVER_DIR, 'cleanup-reports')
const LOG_DIR = path.join(SERVER_DIR, 'logs')
const SUMMARY_LOG_PATH = path.join(LOG_DIR, 'retention-sweeper.jsonl')
const SWEEP_INTERVAL_MS = Number(process.env.SLICER_RETENTION_SWEEP_INTERVAL_MS || 60 * 60 * 1000)

let retentionTimer = null
let runningSweep = null

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function loadEnv() {
  const envPath = path.join(SERVER_DIR, '..', '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).trim().replace(/^['\"]|['\"]$/g, '').replace(/`r`n$/i, '')
  }
  return env
}

function getJobStoreKind() {
  const env = loadEnv()
  const value = (process.env.SLICER_JOB_STORE || env.SLICER_JOB_STORE || '').trim().replace(/`r`n$/i, '')
  return value === 'sqlite' ? 'sqlite' : 'supabase'
}

function bytesToMB(bytes) {
  return Number(((bytes || 0) / (1024 * 1024)).toFixed(2))
}

function bytesToGB(bytes) {
  return Number(((bytes || 0) / (1024 ** 3)).toFixed(3))
}

function listFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return []
  const result = []
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolute = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(absolute))
      continue
    }
    const stats = fs.statSync(absolute)
    result.push({
      name: entry.name,
      fullPath: absolute,
      relativePath: path.relative(SERVER_DIR, absolute),
      size: stats.size,
      mtime: stats.mtime.toISOString(),
      mtimeMs: stats.mtimeMs,
    })
  }
  return result
}

function getDirectorySizeBytes(targetPath) {
  return listFilesRecursive(targetPath).reduce((sum, file) => sum + file.size, 0)
}

function parseServeFileName(sourceUrl) {
  if (typeof sourceUrl !== 'string' || !sourceUrl.includes('/serve/')) return null
  try {
    const url = new URL(sourceUrl)
    const parts = url.pathname.split('/serve/')
    return parts[1] ? decodeURIComponent(parts[1]) : null
  } catch {
    const parts = sourceUrl.split('/serve/')
    return parts[1] ? decodeURIComponent(parts[1].split('?')[0]) : null
  }
}

function getJobAnchorIso(job) {
  return job?.progress?.completedAt || job?.updated_at || job?.created_at || null
}

function isExpiredJob(job, nowMs) {
  const anchorIso = getJobAnchorIso(job)
  const anchorMs = anchorIso ? new Date(anchorIso).getTime() : Number.NaN
  if (!Number.isFinite(anchorMs)) return false

  if (job.status === 'complete') {
    return anchorMs < nowMs - COMPLETE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  }
  if (job.status === 'failed') {
    return anchorMs < nowMs - FAILED_RETENTION_HOURS * 60 * 60 * 1000
  }
  return false
}

function getDiskFreeBytes(targetPath) {
  try {
    const stats = fs.statfsSync(targetPath)
    return stats.bavail * stats.bsize
  } catch {
    return null
  }
}

async function loadJobs() {
  if (getJobStoreKind() === 'sqlite') {
    return sqliteShadowStore.listShadowJobs(5000)
  }

  const env = loadEnv()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return []

  const supabase = createClient(supabaseUrl, supabaseKey)
  const { data, error } = await supabase
    .from('jobs')
    .select('id,title,status,created_at,updated_at,source_url,progress')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

function summarizeFiles(files) {
  return {
    count: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    totalGB: bytesToGB(files.reduce((sum, file) => sum + file.size, 0)),
    samples: files.slice(0, 20).map((file) => ({
      relativePath: file.relativePath,
      sizeMB: bytesToMB(file.size),
      mtime: file.mtime,
    })),
  }
}

async function buildRetentionReport({ apply = false, reason = 'manual', source = 'manual' } = {}) {
  const nowMs = Date.now()
  const jobs = await loadJobs()
  const expiredJobs = jobs.filter((job) => isExpiredJob(job, nowMs))
  const liveJobs = jobs.filter((job) => !isExpiredJob(job, nowMs))
  const referencedServeFiles = new Set(
    liveJobs
      .map((job) => parseServeFileName(job.source_url))
      .filter(Boolean),
  )

  const rootTempFiles = fs.existsSync(TEMP_DIR)
    ? fs.readdirSync(TEMP_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const fullPath = path.join(TEMP_DIR, entry.name)
          const stats = fs.statSync(fullPath)
          return {
            name: entry.name,
            fullPath,
            relativePath: path.relative(SERVER_DIR, fullPath),
            size: stats.size,
            mtime: stats.mtime.toISOString(),
            mtimeMs: stats.mtimeMs,
            referenced: referencedServeFiles.has(entry.name),
          }
        })
    : []

  const expiredRootSources = rootTempFiles.filter((file) => {
    const expiredByAge = file.mtimeMs < nowMs - COMPLETE_RETENTION_DAYS * 24 * 60 * 60 * 1000
    return expiredByAge && !file.referenced
  })

  const transcriptionCacheFiles = listFilesRecursive(path.join(TEMP_DIR, 'transcription-cache')).filter((file) => {
    return file.mtimeMs < nowMs - SOURCE_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  })

  const transcriptionFiles = listFilesRecursive(path.join(TEMP_DIR, 'transcriptions')).filter((file) => {
    return file.mtimeMs < nowMs - SOURCE_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  })

  const thumbCacheFiles = [
    ...listFilesRecursive(path.join(TEMP_DIR, 'thumb-cache')),
    ...listFilesRecursive(path.join(DATA_DIR, 'thumb-cache')),
  ].filter((file) => file.mtimeMs < nowMs - SOURCE_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const sourceCacheFiles = listFilesRecursive(path.join(DATA_DIR, 'source-cache')).filter((file) => {
    return file.mtimeMs < nowMs - SOURCE_CACHE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  })

  const exportTempFiles = [
    ...listFilesRecursive(path.join(TEMP_DIR, 'exports-temp')),
    ...listFilesRecursive(path.join(DATA_DIR, 'exports-temp')),
  ].filter((file) => file.mtimeMs < nowMs - EXPORT_TEMP_RETENTION_HOURS * 60 * 60 * 1000)

  const totalCacheBytes = getDirectorySizeBytes(TEMP_DIR) + getDirectorySizeBytes(DATA_DIR)
  const diskFreeBytes = getDiskFreeBytes(SERVER_DIR)
  const budgetStatus = totalCacheBytes >= CACHE_HARD_CAP_GB * 1024 ** 3
    ? 'hard_cap'
    : totalCacheBytes >= CACHE_WARNING_GB * 1024 ** 3
      ? 'warning'
      : 'ok'
  const diskStatus = diskFreeBytes == null
    ? 'unknown'
    : diskFreeBytes <= LOW_DISK_HARD_STOP_GB * 1024 ** 3
      ? 'hard_stop'
      : diskFreeBytes <= LOW_DISK_WARNING_GB * 1024 ** 3
        ? 'warning'
        : 'ok'

  const totalCandidateBytes = [
    expiredRootSources,
    transcriptionCacheFiles,
    transcriptionFiles,
    thumbCacheFiles,
    sourceCacheFiles,
    exportTempFiles,
  ].flat().reduce((sum, file) => sum + file.size, 0)

  return {
    generatedAt: new Date().toISOString(),
    apply,
    phase: apply ? 'phase5+' : 'phase4-dry-run',
    reason,
    source,
    jobStore: getJobStoreKind(),
    policies: {
      completeRetentionDays: COMPLETE_RETENTION_DAYS,
      failedRetentionHours: FAILED_RETENTION_HOURS,
      sourceCacheRetentionDays: SOURCE_CACHE_RETENTION_DAYS,
      exportTempRetentionHours: EXPORT_TEMP_RETENTION_HOURS,
      cacheWarningGB: CACHE_WARNING_GB,
      cacheHardCapGB: CACHE_HARD_CAP_GB,
      lowDiskWarningGB: LOW_DISK_WARNING_GB,
      lowDiskHardStopGB: LOW_DISK_HARD_STOP_GB,
    },
    jobs: {
      total: jobs.length,
      expired: expiredJobs.length,
      live: liveJobs.length,
      expiredJobIds: expiredJobs.map((job) => job.id),
      expiredJobTitles: expiredJobs.slice(0, 20).map((job) => ({ id: job.id, title: job.title, status: job.status })),
    },
    candidates: {
      expiredRootSources: summarizeFiles(expiredRootSources),
      transcriptionCache: summarizeFiles(transcriptionCacheFiles),
      transcriptions: summarizeFiles(transcriptionFiles),
      thumbCache: summarizeFiles(thumbCacheFiles),
      sourceCache: summarizeFiles(sourceCacheFiles),
      exportTemp: summarizeFiles(exportTempFiles),
      totalCandidateBytes,
      totalCandidateGB: bytesToGB(totalCandidateBytes),
    },
    budget: {
      currentCacheGB: bytesToGB(totalCacheBytes),
      currentCacheMB: bytesToMB(totalCacheBytes),
      status: budgetStatus,
      diskFreeGB: diskFreeBytes == null ? null : bytesToGB(diskFreeBytes),
      diskStatus,
    },
    notes: apply
      ? ['Apply mode enabled. Deletions may occur in later phases.']
      : ['Dry-run only. Nothing was deleted.', budgetStatus !== 'ok' ? `Cache budget status is ${budgetStatus}.` : null, diskStatus !== 'ok' ? `Disk status is ${diskStatus}.` : null].filter(Boolean),
  }
}

function appendSummaryLog(report) {
  ensureDir(LOG_DIR)
  fs.appendFileSync(SUMMARY_LOG_PATH, `${JSON.stringify({
    loggedAt: new Date().toISOString(),
    phase: report.phase,
    source: report.source,
    reason: report.reason,
    jobStore: report.jobStore,
    expiredJobs: report.jobs.expired,
    totalCandidateGB: report.candidates.totalCandidateGB,
    budgetStatus: report.budget.status,
    diskStatus: report.budget.diskStatus,
    apply: report.apply,
  })}\n`)
}

async function runRetentionSweep(options = {}) {
  if (runningSweep) return runningSweep

  runningSweep = (async () => {
    const report = await buildRetentionReport(options)
    ensureDir(REPORT_DIR)
    const reportPath = path.join(REPORT_DIR, `retention-sweep-${report.generatedAt.replace(/[:.]/g, '-')}.json`)
    fs.writeFileSync(reportPath, JSON.stringify({ reportPath, ...report }, null, 2))
    appendSummaryLog(report)
    return { reportPath, ...report }
  })()

  try {
    return await runningSweep
  } finally {
    runningSweep = null
  }
}

function scheduleRetentionSweeps({ intervalMs = SWEEP_INTERVAL_MS, runImmediately = true } = {}) {
  if (retentionTimer) return retentionTimer

  const invoke = async (reason) => {
    try {
      const result = await runRetentionSweep({ apply: false, reason, source: 'youtube-api-scheduler' })
      console.log(`[retention-sweeper] Dry-run complete (${reason}). Candidates: ${result.candidates.totalCandidateGB} GB. Budget: ${result.budget.status}. Report: ${result.reportPath}`)
    } catch (error) {
      console.error('[retention-sweeper] Dry-run failed:', error.message)
    }
  }

  if (runImmediately) {
    setImmediate(() => invoke('startup'))
  }

  retentionTimer = setInterval(() => invoke('interval'), intervalMs)
  if (typeof retentionTimer.unref === 'function') retentionTimer.unref()
  return retentionTimer
}

module.exports = {
  SUMMARY_LOG_PATH,
  buildRetentionReport,
  runRetentionSweep,
  scheduleRetentionSweeps,
}
