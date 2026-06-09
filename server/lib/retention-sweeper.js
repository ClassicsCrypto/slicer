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
    env[trimmed.slice(0, idx)] = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^['\"]|['\"]$/g, '')
      .replace(/`r`n$/i, '')
  }
  return env
}

function getEnvValue(name, fallback = '') {
  const env = loadEnv()
  const value = process.env[name] ?? env[name] ?? fallback
  return typeof value === 'string' ? value.trim().replace(/`r`n$/i, '') : value
}

function isTruthy(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'on', 'apply', 'enabled'].includes(normalized)
}

function getJobStoreKind() {
  const value = getEnvValue('SLICER_JOB_STORE', '')
  return value === 'sqlite' ? 'sqlite' : 'supabase'
}

function shouldApplyRetention() {
  const mode = String(getEnvValue('SLICER_RETENTION_MODE', '')).toLowerCase()
  if (mode === 'apply') return true
  if (mode === 'dry-run' || mode === 'dryrun') return false
  return isTruthy(getEnvValue('SLICER_RETENTION_APPLY', 'false'))
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
    return sqliteShadowStore.listShadowJobs(5000).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      expires_at: row.expires_at,
      deleted_at: row.deleted_at,
      raw_input_url: row.raw_input_url,
      source_url: row.source_url,
      source_path: row.source_path,
      source_cache_key: row.source_cache_key,
      options: JSON.parse(row.options_json || '{}'),
      progress: JSON.parse(row.progress_json || '{}'),
    }))
  }

  const supabaseUrl = getEnvValue('NEXT_PUBLIC_SUPABASE_URL', '')
  const supabaseKey = getEnvValue('SUPABASE_SERVICE_ROLE_KEY', '')
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
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  return {
    count: files.length,
    totalBytes,
    totalGB: bytesToGB(totalBytes),
    samples: files.slice(0, 20).map((file) => ({
      relativePath: file.relativePath,
      sizeMB: bytesToMB(file.size),
      mtime: file.mtime,
    })),
  }
}

function buildBudgetStatus(totalCacheBytes) {
  if (totalCacheBytes >= CACHE_HARD_CAP_GB * 1024 ** 3) return 'hard_cap'
  if (totalCacheBytes >= CACHE_WARNING_GB * 1024 ** 3) return 'warning'
  return 'ok'
}

function buildDiskStatus(diskFreeBytes) {
  if (diskFreeBytes == null) return 'unknown'
  if (diskFreeBytes <= LOW_DISK_HARD_STOP_GB * 1024 ** 3) return 'hard_stop'
  if (diskFreeBytes <= LOW_DISK_WARNING_GB * 1024 ** 3) return 'warning'
  return 'ok'
}

async function collectRetentionState() {
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
  const budgetStatus = buildBudgetStatus(totalCacheBytes)
  const diskStatus = buildDiskStatus(diskFreeBytes)

  const candidateFiles = [
    ...expiredRootSources,
    ...transcriptionCacheFiles,
    ...transcriptionFiles,
    ...thumbCacheFiles,
    ...sourceCacheFiles,
    ...exportTempFiles,
  ]
  const totalCandidateBytes = candidateFiles.reduce((sum, file) => sum + file.size, 0)

  return {
    generatedAt: new Date().toISOString(),
    nowMs,
    jobStore: getJobStoreKind(),
    jobs,
    expiredJobs,
    liveJobs,
    referencedServeFiles,
    expiredRootSources,
    transcriptionCacheFiles,
    transcriptionFiles,
    thumbCacheFiles,
    sourceCacheFiles,
    exportTempFiles,
    candidateFiles,
    totalCandidateBytes,
    totalCacheBytes,
    budgetStatus,
    diskFreeBytes,
    diskStatus,
  }
}

function buildReportFromState(state, { apply = false, reason = 'manual', source = 'manual' } = {}, applied = null) {
  const report = {
    generatedAt: state.generatedAt,
    apply,
    phase: apply ? 'phase5-apply' : 'phase4-dry-run',
    reason,
    source,
    jobStore: state.jobStore,
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
      total: state.jobs.length,
      expired: state.expiredJobs.length,
      live: state.liveJobs.length,
      expiredJobIds: state.expiredJobs.map((job) => job.id),
      expiredJobTitles: state.expiredJobs.slice(0, 20).map((job) => ({ id: job.id, title: job.title, status: job.status })),
    },
    candidates: {
      expiredRootSources: summarizeFiles(state.expiredRootSources),
      transcriptionCache: summarizeFiles(state.transcriptionCacheFiles),
      transcriptions: summarizeFiles(state.transcriptionFiles),
      thumbCache: summarizeFiles(state.thumbCacheFiles),
      sourceCache: summarizeFiles(state.sourceCacheFiles),
      exportTemp: summarizeFiles(state.exportTempFiles),
      totalCandidateBytes: state.totalCandidateBytes,
      totalCandidateGB: bytesToGB(state.totalCandidateBytes),
    },
    budget: {
      currentCacheGB: bytesToGB(state.totalCacheBytes),
      currentCacheMB: bytesToMB(state.totalCacheBytes),
      status: state.budgetStatus,
      diskFreeGB: state.diskFreeBytes == null ? null : bytesToGB(state.diskFreeBytes),
      diskStatus: state.diskStatus,
    },
    applied,
  }

  report.notes = apply
    ? [
        `Real deletion ${report.applied?.errorCount ? 'completed with errors' : 'completed successfully'}.`,
        report.applied ? `Deleted ${report.applied.deletedJobCount} jobs and ${report.applied.deletedFileCount} files.` : null,
        report.budget.status !== 'ok' ? `Cache budget status is ${report.budget.status}.` : null,
        report.budget.diskStatus !== 'ok' ? `Disk status is ${report.budget.diskStatus}.` : null,
      ].filter(Boolean)
    : [
        'Dry-run only. Nothing was deleted.',
        report.budget.status !== 'ok' ? `Cache budget status is ${report.budget.status}.` : null,
        report.budget.diskStatus !== 'ok' ? `Disk status is ${report.budget.diskStatus}.` : null,
      ].filter(Boolean)

  return report
}

function isManagedDeletionPath(filePath) {
  if (!filePath) return false
  const resolved = path.resolve(filePath)
  const managedRoots = [path.resolve(TEMP_DIR), path.resolve(DATA_DIR)]
  return managedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
}

function dedupeFiles(files) {
  const seen = new Set()
  const unique = []
  for (const file of files) {
    const key = path.resolve(file.fullPath)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(file)
  }
  return unique
}

function applyJobDeletion(state) {
  if (state.jobStore !== 'sqlite') {
    throw new Error('Phase 5 apply mode is only enabled for SLICER_JOB_STORE=sqlite')
  }

  const deletedJobIds = []
  const errors = []

  for (const job of state.expiredJobs) {
    try {
      sqliteShadowStore.deleteShadowJob(job.id)
      if (typeof sqliteShadowStore.verifyShadowJobDeleted === 'function') {
        const verification = sqliteShadowStore.verifyShadowJobDeleted(job.id, {
          source: 'retention-sweeper',
          action: 'ttl_delete',
        })
        if (verification && verification.ok === false) {
          throw new Error(`SQLite delete verification failed for ${job.id}`)
        }
      }
      deletedJobIds.push(job.id)
    } catch (error) {
      errors.push({ type: 'job_delete_error', jobId: job.id, message: error.message })
    }
  }

  return { deletedJobIds, errors }
}

function applyFileDeletion(state) {
  const deletedFiles = []
  const errors = []
  let deletedBytes = 0

  for (const file of dedupeFiles(state.candidateFiles)) {
    if (!isManagedDeletionPath(file.fullPath)) {
      errors.push({ type: 'unsafe_file_path', relativePath: file.relativePath, fullPath: file.fullPath })
      continue
    }

    if (!fs.existsSync(file.fullPath)) continue

    try {
      const stats = fs.statSync(file.fullPath)
      fs.unlinkSync(file.fullPath)
      deletedBytes += stats.size
      deletedFiles.push({
        relativePath: file.relativePath,
        sizeMB: bytesToMB(stats.size),
      })
    } catch (error) {
      errors.push({ type: 'file_delete_error', relativePath: file.relativePath, message: error.message })
    }
  }

  return { deletedFiles, deletedBytes, errors }
}

function applyRetentionDeletion(state) {
  const jobResult = applyJobDeletion(state)
  const fileResult = applyFileDeletion(state)
  const errors = [...jobResult.errors, ...fileResult.errors]

  return {
    deletedJobIds: jobResult.deletedJobIds,
    deletedJobCount: jobResult.deletedJobIds.length,
    deletedFiles: fileResult.deletedFiles,
    deletedFileCount: fileResult.deletedFiles.length,
    deletedBytes: fileResult.deletedBytes,
    deletedGB: bytesToGB(fileResult.deletedBytes),
    errorCount: errors.length,
    errors,
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
    deletedJobCount: report.applied?.deletedJobCount || 0,
    deletedFileCount: report.applied?.deletedFileCount || 0,
    deletedGB: report.applied?.deletedGB || 0,
    errorCount: report.applied?.errorCount || 0,
  })}\n`)
}

async function runRetentionSweep(options = {}) {
  if (runningSweep) return runningSweep

  runningSweep = (async () => {
    const apply = options.apply === true
    const state = await collectRetentionState()
    const applied = apply ? applyRetentionDeletion(state) : null
    const report = buildReportFromState(state, options, applied)

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
    const apply = shouldApplyRetention()
    try {
      const result = await runRetentionSweep({
        apply,
        reason,
        source: 'youtube-api-scheduler',
      })
      const prefix = apply ? 'Apply' : 'Dry-run'
      const suffix = apply
        ? `Deleted ${result.applied?.deletedJobCount || 0} jobs and ${result.applied?.deletedFileCount || 0} files (${result.applied?.deletedGB || 0} GB).`
        : `Candidates: ${result.candidates.totalCandidateGB} GB.`
      console.log(`[retention-sweeper] ${prefix} complete (${reason}). ${suffix} Budget: ${result.budget.status}. Report: ${result.reportPath}`)
    } catch (error) {
      const prefix = apply ? 'Apply' : 'Dry-run'
      console.error(`[retention-sweeper] ${prefix} failed:`, error.message)
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
  buildRetentionReport: async (options = {}) => buildReportFromState(await collectRetentionState(), options, null),
  collectRetentionState,
  runRetentionSweep,
  scheduleRetentionSweeps,
  shouldApplyRetention,
}
