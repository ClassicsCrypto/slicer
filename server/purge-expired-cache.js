const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const COMPLETE_RETENTION_DAYS = 7
const FAILED_RETENTION_HOURS = 48
const TEMP_DIR = path.join(__dirname, 'temp')
const REPORT_DIR = path.join(__dirname, 'cleanup-reports')

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const env = {}
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).replace(/\u0000/g, '')
    const value = trimmed.slice(idx + 1).replace(/\u0000/g, '')
    env[key] = value
  }
  return env
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size))
  return chunks
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

function bytesToGB(bytes) {
  return Number(((bytes || 0) / (1024 ** 3)).toFixed(3))
}

async function main() {
  const apply = process.argv.includes('--apply')
  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const nowMs = Date.now()

  ensureDir(REPORT_DIR)

  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id,title,status,created_at,updated_at,source_url,progress')
    .order('created_at', { ascending: false })

  if (error) throw error

  const allJobs = jobs || []
  const expiredJobs = allJobs.filter((job) => isExpiredJob(job, nowMs))
  const liveJobs = allJobs.filter((job) => !isExpiredJob(job, nowMs))

  const referencedServeFiles = new Set(
    liveJobs
      .map((job) => parseServeFileName(job.source_url))
      .filter(Boolean),
  )

  const rootFiles = fs.existsSync(TEMP_DIR)
    ? fs.readdirSync(TEMP_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const fullPath = path.join(TEMP_DIR, entry.name)
          const stat = fs.statSync(fullPath)
          const expiredByAge = stat.mtimeMs < nowMs - COMPLETE_RETENTION_DAYS * 24 * 60 * 60 * 1000
          return {
            name: entry.name,
            fullPath,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            referenced: referencedServeFiles.has(entry.name),
            expiredByAge,
          }
        })
    : []

  const filesToDelete = rootFiles.filter((file) => file.expiredByAge && !file.referenced)
  const expiredJobIds = expiredJobs.map((job) => job.id)

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    completeRetentionDays: COMPLETE_RETENTION_DAYS,
    failedRetentionHours: FAILED_RETENTION_HOURS,
    totalJobs: allJobs.length,
    expiredJobs: expiredJobs.length,
    liveJobs: liveJobs.length,
    expiredJobIds,
    referencedServeFiles: referencedServeFiles.size,
    filesToDelete: filesToDelete.length,
    filesToDeleteGB: bytesToGB(filesToDelete.reduce((sum, file) => sum + file.size, 0)),
    largestFilesToDelete: filesToDelete
      .sort((a, b) => b.size - a.size)
      .slice(0, 20)
      .map((file) => ({ name: file.name, sizeGB: bytesToGB(file.size), mtime: file.mtime })),
  }

  const reportPath = path.join(REPORT_DIR, `purge-expired-cache-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  if (apply) {
    for (const ids of chunk(expiredJobIds, 100)) {
      if (ids.length === 0) continue
      await supabase.from('clips').delete().in('job_id', ids)
      const { error: deleteError } = await supabase.from('jobs').delete().in('id', ids)
      if (deleteError) throw deleteError
    }

    for (const file of filesToDelete) {
      try {
        fs.unlinkSync(file.fullPath)
      } catch (err) {
        console.error(`Failed to delete ${file.fullPath}:`, err.message)
      }
    }
  }

  console.log(JSON.stringify({
    reportPath,
    ...report,
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
