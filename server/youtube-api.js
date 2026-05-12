/**
 * Slicer YouTube Download API
 *
 * Local server that runs yt-dlp to download YouTube/Twitch videos,
 * uploads to Supabase Storage, and returns the public URL.
 *
 * Runs on Jay's machine - always on.
 *
 * Usage: node server/youtube-api.js
 * Endpoint: POST http://localhost:3001/download
 * Body: { "url": "https://youtube.com/watch?v=..." }
 * Returns: { "publicUrl": "https://...", "duration": 120, "title": "..." }
 *
 * Limits:
 *   - Max 3 hours video duration
 *   - Max 2GB file size
 *   - Audio-only download (faster, smaller, sufficient for AI analysis)
 */

const http = require('http')
const { execSync, exec, spawn, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const sqliteShadowStore = require('./lib/sqlite-shadow-store.js')
const retentionSweeper = require('./lib/retention-sweeper.js')

// Load .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

const PORT = parseInt(process.env.SLICER_YT_PORT || '3001')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEMP_DIR = path.join(__dirname, 'temp')
const THUMB_CACHE_DIR = path.join(TEMP_DIR, 'thumb-cache')
const STILL_CACHE_DIR = path.join(TEMP_DIR, 'still-cache')
const MAX_DURATION_SEC = 3 * 60 * 60 // 3 hours
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })
if (!fs.existsSync(THUMB_CACHE_DIR)) fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true })
if (!fs.existsSync(STILL_CACHE_DIR)) fs.mkdirSync(STILL_CACHE_DIR, { recursive: true })

// Smart cache: videoId → { publicUrl, duration, title, filePath, cachedAt }
const videoCache = new Map()
// Active downloads: downloadId → { status, publicUrl, title, error, progress }
const activeDownloads = new Map()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const activeJobRuns = new Set()
const PARTIAL_FILE_RE = /\.(part|ytdl)$/i

function getJobStoreKind() {
  return process.env.SLICER_JOB_STORE === 'sqlite' ? 'sqlite' : 'supabase'
}

function isSqlitePrimaryJobStore() {
  return getJobStoreKind() === 'sqlite'
}

function buildUpdatedSqliteJob(existing, patch) {
  return {
    ...existing,
    ...patch,
    id: existing.id,
    user_id: patch.user_id ?? existing.user_id,
    title: patch.title ?? existing.title,
    source_url: patch.source_url ?? existing.source_url,
    options: patch.options ?? existing.options,
    progress: patch.progress ?? existing.progress,
    created_at: patch.created_at ?? existing.created_at,
    updated_at: patch.updated_at ?? new Date().toISOString(),
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJob(jobId) {
  if (isSqlitePrimaryJobStore()) {
    return sqliteShadowStore.getShadowJob(jobId)
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  const response = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}&select=*`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  const rows = await response.json()
  return rows?.[0] ?? null
}

async function updateJob(jobId, patch) {
  if (isSqlitePrimaryJobStore()) {
    const existing = sqliteShadowStore.getShadowJob(jobId)
    if (!existing) return null
    const updatedJob = buildUpdatedSqliteJob(existing, patch)
    sqliteShadowStore.upsertShadowJob(updatedJob)
    return sqliteShadowStore.getShadowJob(jobId)
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  })

  const updated = await fetchJob(jobId)
  if (updated && sqliteShadowStore.isSqliteShadowEnabled()) {
    try {
      sqliteShadowStore.upsertShadowJob(updated)
      const parity = sqliteShadowStore.verifyShadowJobParity(updated, {
        source: 'youtube-api/updateJob',
        action: 'upsert',
      })
      if (!parity.ok) {
        const fields = (parity.mismatches || []).map((mismatch) => mismatch.field).join(', ') || 'unknown'
        console.warn(`[shadow-sqlite] Parity mismatch for ${jobId} after youtube-api/updateJob. Fields: ${fields}. Log: ${sqliteShadowStore.PARITY_LOG_PATH}`)
      }
    } catch (error) {
      console.error('[shadow-sqlite] Failed to mirror job from youtube-api update:', jobId, error.message)
    }
  }

  return updated
}

async function mergeJobProgress(jobId, patch, statusOverride) {
  const existing = await fetchJob(jobId)
  const nextProgress = { ...(existing?.progress || {}), ...patch }
  const payload = { progress: nextProgress }
  if (statusOverride) payload.status = statusOverride
  await updateJob(jobId, payload)
  return nextProgress
}

function pruneDirectoryFiles(dirPath, shouldDelete) {
  if (!fs.existsSync(dirPath)) return 0
  let deleted = 0
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolute = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      deleted += pruneDirectoryFiles(absolute, shouldDelete)
      continue
    }
    let stats
    try {
      stats = fs.statSync(absolute)
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    if (shouldDelete(absolute, stats)) {
      try {
        fs.unlinkSync(absolute)
        deleted += 1
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }
  return deleted
}


async function reconcileInterruptedSqliteJobs() {
  if (!isSqlitePrimaryJobStore()) return

  const staleMinutes = Number(process.env.SLICER_INTERRUPTED_JOB_MINUTES || 45)
  const cutoffMs = Date.now() - staleMinutes * 60 * 1000
  const rows = sqliteShadowStore.listShadowJobs(500)
  const completedRows = rows.filter((row) => row.status === 'complete' && !row.deleted_at)
  let recovered = 0
  let failed = 0

  for (const row of rows) {
    if (row.status !== 'processing' || row.deleted_at) continue
    const updatedMs = new Date(row.updated_at || row.created_at).getTime()
    if (Number.isFinite(updatedMs) && updatedMs > cutoffMs) continue

    let progress = {}
    try { progress = JSON.parse(row.progress_json || '{}') } catch {}

    const matchingComplete = completedRows.find((candidate) => (
      candidate.id !== row.id &&
      candidate.raw_input_url === row.raw_input_url &&
      candidate.source_cache_key === row.source_cache_key &&
      candidate.options_json === row.options_json
    ))

    const nowIso = new Date().toISOString()
    if (matchingComplete) {
      let sourceProgress = {}
      try { sourceProgress = JSON.parse(matchingComplete.progress_json || '{}') } catch {}
      await updateJob(row.id, {
        status: 'complete',
        progress: {
          ...progress,
          ...sourceProgress,
          phase: 'complete',
          progress: 'Clip selection complete. Recovered from matching completed run after API restart interrupted final write.',
          recoveredFromJobId: matchingComplete.id,
          recoveredAt: nowIso,
          completedAt: nowIso,
        },
      })
      recovered += 1
      continue
    }

    await updateJob(row.id, {
      status: 'failed',
      progress: {
        ...progress,
        phase: 'failed',
        progress: `Processing was interrupted by an API restart and did not resume within ${staleMinutes} minutes. Please retry the job.`,
        interruptedAt: nowIso,
        completedAt: nowIso,
      },
    })
    failed += 1
  }

  if (recovered || failed) {
    console.warn(`[job-reconcile] Recovered ${recovered} interrupted jobs; marked ${failed} stale jobs failed.`)
  }
}

function cleanupTempArtifacts() {
  const now = Date.now()
  const deleted = pruneDirectoryFiles(TEMP_DIR, (absolute, stats) => {
    const ageMs = now - stats.mtimeMs
    const base = path.basename(absolute).toLowerCase()
    if (absolute.includes(`${path.sep}transcriptions${path.sep}`)) return ageMs > 2 * 60 * 60 * 1000
    if (absolute.includes(`${path.sep}transcription-cache${path.sep}`)) return ageMs > 14 * 24 * 60 * 60 * 1000
    if (absolute.includes(`${path.sep}thumb-cache${path.sep}`)) return ageMs > 7 * 24 * 60 * 60 * 1000
    if (PARTIAL_FILE_RE.test(base)) return ageMs > 6 * 60 * 60 * 1000
    if (base.endsWith('.ass') || base.startsWith('run-scoring-test') || base.startsWith('control-test')) return ageMs > 12 * 60 * 60 * 1000
    return false
  })

  if (deleted > 0) {
    console.log(`[cleanup] Removed ${deleted} stale temp artifacts`)
  }
}

function getServeBaseUrl() {
  try {
    const tunnelFile = path.join(__dirname, 'tunnel-url.txt')
    if (fs.existsSync(tunnelFile)) {
      const tunnelUrl = fs.readFileSync(tunnelFile, 'utf8').trim()
      if (tunnelUrl) return tunnelUrl
    }
  } catch {}
  return `http://localhost:${PORT}`
}

function getServeUrl(fileName) {
  return `${getServeBaseUrl()}/serve/${fileName}`
}

function resolveServedInputPath(inputUrl) {
  if (inputUrl && inputUrl.includes('/serve/')) {
    const fileName = inputUrl.split('/serve/').pop()?.split(/[?#]/)[0]
    if (fileName) {
      const localPath = path.join(TEMP_DIR, decodeURIComponent(fileName))
      if (fs.existsSync(localPath)) return localPath
    }
  }
  return inputUrl
}

const DIRECT_MEDIA_EXT_RE = /\.(mp4|mov|m4v|webm|mkv|mp3|m4a|wav|aac)(?:$|[?#])/i

function looksLikeDirectMediaUrl(rawUrl) {
  try {
    return DIRECT_MEDIA_EXT_RE.test(new URL(rawUrl).pathname)
  } catch {
    return DIRECT_MEDIA_EXT_RE.test(rawUrl)
  }
}

function isXBroadcastUrl(rawUrl) {
  return /(?:x\.com|twitter\.com)\/i\/broadcasts\/[a-zA-Z0-9_-]+/i.test(String(rawUrl || ''))
}

function isTwitchUrl(rawUrl) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase()
    return hostname === 'twitch.tv' || hostname.endsWith('.twitch.tv')
  } catch {
    return /(?:^|\.)twitch\.tv\//i.test(String(rawUrl || ''))
  }
}

function getDownloadFormat(rawUrl) {
  if (isXBroadcastUrl(rawUrl)) {
    return 'bv*[height<=480]+ba/b[height<=480]/bv*[height<=720]+ba/b[height<=720]/best'
  }

  if (isTwitchUrl(rawUrl)) {
    return 'b[height<=360]/b[height<=480]/bv*[height<=360]+ba/b[height<=360]/bv*[height<=480]+ba/b[height<=480]/b[height<=720]/bv*[height<=720]+ba/best[ext=mp4]/best'
  }

  return 'b[height<=360]/b[height<=480]/bv*[height<=360]+ba/b[height<=360]/bv*[height<=480]+ba/b[height<=480]/best'
}

function canonicalizeSourceInputUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    const xBroadcastMatch = parsed.pathname.match(/\/i\/broadcasts\/([a-zA-Z0-9_-]+)/)
    if (xBroadcastMatch && /(?:^|\.)x\.com$|(?:^|\.)twitter\.com$/i.test(parsed.hostname)) {
      return `${parsed.protocol}//${parsed.hostname}/i/broadcasts/${xBroadcastMatch[1]}`
    }
    parsed.searchParams.delete('s')
    parsed.searchParams.delete('t')
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

function getDirectMediaMeta(rawUrl) {
  try {
    const parsed = new URL(rawUrl)
    const basename = decodeURIComponent(path.basename(parsed.pathname)) || 'direct-media'
    const ext = path.extname(basename) || '.mp4'
    const title = basename.replace(new RegExp(`${ext.replace('.', '\\.')}$$`, 'i'), '') || basename
    return { title, ext }
  } catch {
    return { title: 'direct-media', ext: '.mp4' }
  }
}

function getMediaDuration(input) {
  try {
    const safeInput = String(input).replace(/"/g, '\\"')
    const raw = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${safeInput}"`,
      { timeout: 15000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim()
    const duration = Math.round(parseFloat(raw) || 0)
    return Number.isFinite(duration) ? duration : 0
  } catch (error) {
    console.warn('[ffprobe] duration lookup failed:', error.message)
    return 0
  }
}

async function downloadDirectMedia(rawUrl, outputPath) {
  const browserHeaders = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
  }

  try {
    const response = await fetch(rawUrl, { headers: browserHeaders })
    if (response.ok && response.body) {
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(outputPath))
      return
    }
  } catch (error) {
    console.warn('[direct-download] fetch failed:', error.message)
  }

  const safeUrl = String(rawUrl).replace(/"/g, '\\"')
  const safePath = String(outputPath).replace(/"/g, '\\"')
  execSync(
    `curl.exe -L --fail --silent --show-error -A "${browserHeaders['user-agent']}" -H "Accept: ${browserHeaders.accept}" -o "${safePath}" "${safeUrl}"`,
    { timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] },
  )
}

async function ensureDownloadedSource(rawUrl) {
  rawUrl = canonicalizeSourceInputUrl(rawUrl)
  if (looksLikeDirectMediaUrl(rawUrl)) {
    const directMeta = getDirectMediaMeta(rawUrl)
    const fileId = getCacheKey(rawUrl).replace(/[^a-z0-9_-]/gi, '').slice(0, 12) || crypto.randomUUID().slice(0, 12)
    const serveFileName = `${fileId}-direct${directMeta.ext}`
    const servePath = path.join(TEMP_DIR, serveFileName)

    if (!fs.existsSync(servePath)) {
      await downloadDirectMedia(rawUrl, servePath)
    }

    const duration = getMediaDuration(servePath)
    if (duration > MAX_DURATION_SEC) {
      throw new Error(`Video too long. Max ${Math.floor(MAX_DURATION_SEC / 60)} minutes allowed.`)
    }

    const payload = {
      publicUrl: getServeUrl(serveFileName),
      title: directMeta.title,
      duration,
      filePath: servePath,
    }
    setCache(rawUrl, payload)
    return { ...payload, cached: false }
  }

  const cached = getFromCache(rawUrl)
  if (cached) {
    return {
      publicUrl: cached.publicUrl,
      title: cached.title,
      duration: cached.duration,
      filePath: cached.filePath,
      cached: true,
    }
  }

  const info = getVideoInfo(rawUrl)
  if (info.duration > MAX_DURATION_SEC) {
    throw new Error(`Video too long: ${Math.round(info.duration / 60)}min (max ${MAX_DURATION_SEC / 60}min)`)
  }

  const reusable = findReusableDownloadedFile(info.id)
  if (reusable) {
    const payload = {
      publicUrl: getServeUrl(reusable.fileName),
      duration: info.duration || getMediaDuration(reusable.absolute),
      title: info.title,
      videoId: info.id,
      filePath: reusable.absolute,
    }
    setCache(rawUrl, payload)
    console.log(`[cache] REUSE_DISK: ${info.id} → ${reusable.fileName}`)
    return { ...payload, cached: true }
  }

  const fileId = crypto.randomBytes(8).toString('hex')
  const outputTemplate = path.join(TEMP_DIR, `${fileId}.%(ext)s`)
  await downloadAudio(rawUrl, outputTemplate)

  const files = fs.readdirSync(TEMP_DIR).filter((fileName) => fileName.startsWith(fileId))
  if (!files.length) throw new Error('No output file found after download')

  const outputFile = path.join(TEMP_DIR, files[0])
  const fileExt = path.extname(files[0]) || '.mp4'
  const serveFileName = `${fileId}-${info.id}${fileExt}`
  const servePath = path.join(TEMP_DIR, serveFileName)
  if (outputFile !== servePath) fs.renameSync(outputFile, servePath)

  const publicUrl = getServeUrl(serveFileName)
  setCache(rawUrl, { publicUrl, duration: info.duration, title: info.title, videoId: info.id, filePath: servePath })

  return {
    publicUrl,
    title: info.title,
    duration: info.duration,
    filePath: servePath,
    cached: false,
  }
}

function getCacheKey(url) {
  // Extract video ID from YouTube/Twitch/X URLs
  const ytMatch = url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (ytMatch) return `yt:${ytMatch[1]}`
  const twitchMatch = url.match(/twitch\.tv\/videos\/(\d+)/)
  if (twitchMatch) return `tw:${twitchMatch[1]}`
  const xMatch = url.match(/(?:x\.com|twitter\.com)\/i\/broadcasts\/([a-zA-Z0-9_-]+)/)
  if (xMatch) return `xb:${xMatch[1]}`
  const xVideoMatch = url.match(/(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)/)
  if (xVideoMatch) return `xt:${xVideoMatch[1]}`
  return `url:${require('crypto').createHash('md5').update(url).digest('hex')}`
}

function getFromCache(url) {
  const key = getCacheKey(url)
  const entry = videoCache.get(key)
  if (!entry) return null
  // Check TTL and file exists
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) { videoCache.delete(key); return null }
  if (!fs.existsSync(entry.filePath)) { videoCache.delete(key); return null }
  console.log(`[cache] HIT: ${key} → ${entry.publicUrl}`)
  return entry
}

function setCache(url, data) {
  const key = getCacheKey(url)
  videoCache.set(key, { ...data, cachedAt: Date.now() })
  console.log(`[cache] SET: ${key} (${videoCache.size} entries)`)
}

function findReusableDownloadedFile(videoId) {
  if (!videoId || !fs.existsSync(TEMP_DIR)) return null

  const reusableExts = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.mp3', '.m4a', '.wav', '.aac'])
  const candidates = fs.readdirSync(TEMP_DIR)
    .filter((fileName) => {
      if (PARTIAL_FILE_RE.test(fileName)) return false
      if (fileName.includes('-whisper.')) return false
      if (!fileName.includes(`-${videoId}.`)) return false
      return reusableExts.has(path.extname(fileName).toLowerCase())
    })
    .map((fileName) => {
      const absolute = path.join(TEMP_DIR, fileName)
      const stats = fs.statSync(absolute)
      return { fileName, absolute, stats }
    })
    .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs)

  return candidates[0] || null
}

/**
 * Get video info without downloading
 */
function getVideoInfo(url) {
  if (looksLikeDirectMediaUrl(url)) {
    const directMeta = getDirectMediaMeta(url)
    return {
      duration: getMediaDuration(url),
      title: directMeta.title,
      id: getCacheKey(url).slice(0, 12),
    }
  }

  try {
    const raw = execSync(
      `yt-dlp --js-runtimes node --remote-components ejs:github --no-download --print "%(duration)s|||%(title)s|||%(id)s" "${url}"`,
      { timeout: 15000, encoding: 'utf8' }
    ).trim()
    const [duration, title, id] = raw.split('|||')
    return { duration: parseInt(duration) || 0, title: title || 'Untitled', id: id || 'unknown' }
  } catch (err) {
    throw new Error(`Failed to get video info: ${err.message}`)
  }
}

/**
 * Download best audio stream (no ffmpeg needed - downloads native format)
 */
function downloadAudio(url, outputPath) {
  return new Promise((resolve, reject) => {
    // Download best video+audio merged (mp4 preferred)
    const format = getDownloadFormat(url)
    const cmd = `yt-dlp --js-runtimes node --remote-components ejs:github --socket-timeout 20 -f "${format}" --merge-output-format mp4 -o "${outputPath}" "${url}"`
    console.log(`[yt-dlp] downloading: ${cmd}`)

    exec(cmd, { timeout: 30 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[yt-dlp] error:', stderr?.slice(-500))
        reject(new Error(`Download failed: ${stderr?.slice(-200) || err.message}`))
        return
      }
      console.log('[yt-dlp] done:', stdout.trim().slice(-200))
      resolve()
    })
  })
}

/**
 * Upload file to Supabase Storage
 */
async function uploadToSupabase(filePath, fileName) {
  const fileBuffer = fs.readFileSync(filePath)
  const storagePath = `youtube/${fileName}`

  const ext = path.extname(fileName).toLowerCase()
  const contentType = ext === '.mp4' ? 'video/mp4'
    : ext === '.webm' ? 'video/webm'
    : ext === '.mkv' ? 'video/x-matroska'
    : ext === '.mp3' ? 'audio/mpeg'
    : ext === '.m4a' ? 'audio/mp4'
    : 'application/octet-stream'

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/slicer-videos/${storagePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: fileBuffer,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upload failed: ${res.status} ${text}`)
  }

  // Return public URL
  return `${SUPABASE_URL}/storage/v1/object/public/slicer-videos/${storagePath}`
}

/**
 * Handle download request
 */
async function handleDownload(req, res) {
  // Parse body
  let body = ''
  for await (const chunk of req) body += chunk

  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' })
  }

  const { url } = parsed
  if (!url) return sendJson(res, 400, { error: 'url is required' })

  console.log(`\n[download] request: ${url}`)

  // Check cache first
  const cached = getFromCache(url)
  if (cached) {
    return sendJson(res, 200, {
      publicUrl: cached.publicUrl,
      duration: cached.duration,
      title: cached.title,
      videoId: cached.videoId,
      cached: true,
    })
  }

  try {
    // 1. Get video info
    const info = getVideoInfo(url)
    console.log(`[download] title="${info.title}" duration=${info.duration}s`)

    if (info.duration > MAX_DURATION_SEC) {
      return sendJson(res, 400, {
        error: `Video too long: ${Math.round(info.duration / 60)}min (max ${MAX_DURATION_SEC / 60}min)`,
      })
    }

    // 2. Download audio
    const fileId = crypto.randomBytes(8).toString('hex')
    const outputTemplate = path.join(TEMP_DIR, `${fileId}.%(ext)s`)
    await downloadAudio(url, outputTemplate)

    // Find the output file (yt-dlp may change extension)
    const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId))
    if (files.length === 0) throw new Error('No output file found after download')

    const outputFile = path.join(TEMP_DIR, files[0])
    const fileSize = fs.statSync(outputFile).size
    console.log(`[download] file: ${files[0]} size: ${(fileSize / 1024 / 1024).toFixed(1)}MB`)

    if (fileSize > MAX_FILE_SIZE) {
      fs.unlinkSync(outputFile)
      return sendJson(res, 400, {
        error: `File too large: ${(fileSize / 1024 / 1024).toFixed(0)}MB (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
      })
    }

    // 3. Serve directly from local server (skip Supabase — 50MB limit)
    const fileExt = path.extname(files[0]) || '.mp4'
    const serveFileName = `${fileId}-${info.id}${fileExt}`
    // Rename to a predictable name
    const servePath = path.join(TEMP_DIR, serveFileName)
    if (outputFile !== servePath) fs.renameSync(outputFile, servePath)

    // Build a public URL via the tunnel
    let tunnelUrl = ''
    try {
      const tunnelFile = path.join(__dirname, 'tunnel-url.txt')
      if (fs.existsSync(tunnelFile)) tunnelUrl = fs.readFileSync(tunnelFile, 'utf8').trim()
    } catch {}

    const publicUrl = tunnelUrl
      ? `${tunnelUrl}/serve/${serveFileName}`
      : `http://localhost:${PORT}/serve/${serveFileName}`

    console.log(`[download] serving locally: ${publicUrl}`)

    // 4. Cache it
    setCache(url, { publicUrl, duration: info.duration, title: info.title, videoId: info.id, filePath: servePath })

    // 5. Return URL (file stays in temp for serving)
    sendJson(res, 200, {
      publicUrl,
      duration: info.duration,
      title: info.title,
      videoId: info.id,
      cached: false,
    })

  } catch (err) {
    console.error(`[download] ERROR:`, err.message)
    sendJson(res, 500, { error: err.message })
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

/**
 * Handle clip export - FFmpeg cuts a segment from a source URL
 * POST /clip { sourceUrl, startTime, endTime, title? }
 * Returns the MP4 file as a download
 */
async function handleClip(req, res) {
  let body = ''
  for await (const chunk of req) body += chunk

  let parsed
  try { parsed = JSON.parse(body) } catch {
    return sendJson(res, 400, { error: 'Invalid JSON' })
  }

  const { sourceUrl, startTime, endTime, title, subtitles, subtitleOptions, aspectRatio, originalStartTime } = parsed
  const watermarkEnabled = subtitleOptions?.watermarkEnabled !== false
  if (!sourceUrl || startTime == null || endTime == null) {
    return sendJson(res, 400, { error: 'sourceUrl, startTime, endTime required' })
  }

  const duration = endTime - startTime
  if (duration < 1 || duration > 300) {
    return sendJson(res, 400, { error: 'Clip must be 1-300 seconds' })
  }

  console.log(`\n[clip] request: ${startTime}s → ${endTime}s (${duration}s) from ${sourceUrl.slice(0, 80)}...`)
  console.log(`[clip] originalStartTime: ${originalStartTime}, trimOffset: ${startTime - (originalStartTime ?? startTime)}`)
  console.log(`[clip] subtitles: ${subtitles ? subtitles.length + ' words' : 'NONE'}`)
  if (subtitles?.length > 0) console.log(`[clip] first 3 sub timestamps:`, subtitles.slice(0, 3).map(w => `${w.text}@${w.start}s`))
  console.log(`[clip] subtitleOptions:`, JSON.stringify(subtitleOptions || {}))

  const fileId = crypto.randomBytes(8).toString('hex')
  const outputFile = path.join(TEMP_DIR, `${fileId}-clip.mp4`)
  const srtFile = path.join(TEMP_DIR, `${fileId}.srt`)

  try {
    const resolveClipInputPath = (inputUrl) => {
      if (inputUrl && inputUrl.includes('/serve/')) {
        const fileName = inputUrl.split('/serve/').pop()?.split(/[?#]/)[0]
        if (fileName) {
          const localPath = path.join(TEMP_DIR, decodeURIComponent(fileName))
          if (fs.existsSync(localPath)) return localPath
        }
      }
      return inputUrl
    }

    // Generate SRT subtitle file if subtitles provided
    let subtitleFilter = ''
    if (subtitles && subtitles.length > 0 && subtitleOptions?.enabled !== false) {
      // Subtitle word timestamps are 0-based relative to the ORIGINAL clip start.
      // When user trims the beginning, we pass a later startTime but subtitles still start at 0.
      // We need to offset: if original clip started at 100 and had a word at 3s,
      // but user trimmed to start at 104, that word should now be at -1s (before the trim = skip it).
      // The trimOffset tells generateSRT how much to subtract from each word timestamp.
      // parsed.originalStartTime = the original clip.start_time (before trimming)
      const originalStart = parsed.originalStartTime ?? startTime
      const trimOffset = startTime - originalStart  // How many seconds trimmed from front
      const clipDuration = endTime - startTime
      const opts = subtitleOptions || {}
      const textCase = opts.textCase || 'original'
      const subtitleMode = opts.mode || (opts.style === 'karaoke' ? 'karaoke' : 'phrase')
      const animationPreset = opts.animationPreset || 'pop'

      // Filter words that fall within the trimmed window and shift their timestamps
      const trimmedSubs = (opts.profanityFilter ? censorSubtitleWords(subtitles) : subtitles)
        .map(w => ({ ...w, start: w.start - trimOffset, end: w.end - trimOffset }))
        .filter(w => w.end > 0 && w.start < clipDuration)
      
      // Build style parameters
      const fontSize = opts.size === 'small' ? 22 : opts.size === 'large' ? 40 : 30
      const hexColor = (opts.color || '#ffffff').replace('#', '')
      const r = hexColor.slice(0, 2), g = hexColor.slice(2, 4), b = hexColor.slice(4, 6)
      const basePrimaryColour = `&H00${b}${g}${r}`
      const highlightHex = (opts.highlightColor || '#ffeb3b').replace('#', '')
      const hR = highlightHex.slice(0, 2), hG = highlightHex.slice(2, 4), hB = highlightHex.slice(4, 6)
      const highlightColour = `&H00${hB}${hG}${hR}`
      const primaryColour = subtitleMode === 'karaoke' || subtitleMode === 'active_word' ? highlightColour : basePrimaryColour
      const secondaryColour = subtitleMode === 'karaoke' ? basePrimaryColour : primaryColour
      const fontsDir = path.join(__dirname, 'fonts')
      const fontNameMap = {
        'impact': 'Impact',
        'bebas': 'Bebas Neue',
        'montserrat': 'Montserrat',
        'sora': 'Sora',
        'arial_black': 'Arial Black',
        'trebuchet': 'Trebuchet MS',
        'verdana': 'Verdana',
        'georgia': 'Georgia',
        'times_new_roman': 'Times New Roman',
      }
      const fontName = fontNameMap[opts.font] || 'Impact'
      const outlineThickness = opts.outlineThickness || 'medium'
      const outlineSize = outlineThickness === 'none' ? 0 : outlineThickness === 'thin' ? 1 : outlineThickness === 'thick' ? 3 : 2
      const outlineHex = (opts.outlineColor || '#000000').replace('#', '')
      const oR = outlineHex.slice(0, 2), oG = outlineHex.slice(2, 4), oB = outlineHex.slice(4, 6)
      const outlineColour = `&H00${oB}${oG}${oR}`
      const shadowSize = opts.shadow ? 2 : 0
      // ASS Alignment: 2=bottom-center, 5=middle-center, 8=top-center
      const safeZone = opts.safeZone || 'auto'
      const alignment = safeZone === 'upper_safe' || opts.position === 'top' ? 8 : safeZone === 'center_safe' || opts.position === 'center' ? 5 : 2
      const marginV = safeZone === 'upper_safe' || opts.position === 'top' ? 86 : safeZone === 'center_safe' || opts.position === 'center' ? 0 : 120

      // Generate proper ASS file (reliable alignment vs SRT+force_style)
      const assFile = srtFile.replace('.srt', '.ass')
      const assEventLines = buildAssDialogueLines(trimmedSubs, {
        textCase,
        mode: subtitleMode,
        animationPreset,
        baseColour: basePrimaryColour,
        highlightColour,
        activeWordStyle: opts.activeWordStyle || 'pill',
      })
      const assEvents = assEventLines.join('\n')
      const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColour},${secondaryColour},${outlineColour},&H80000000,-1,0,0,0,100,100,0,0,1,${outlineSize},${shadowSize},${alignment},0,0,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${assEvents}`
      fs.writeFileSync(assFile, assContent, 'utf8')
      console.log(`[clip] generated ASS: ${trimmedSubs.length} words, mode=${subtitleMode}, animation=${animationPreset}, alignment=${alignment}, marginV=${marginV}`)

      // Also write SRT for any legacy code paths
      const srtContent = generateSRT(trimmedSubs, 0, textCase)
      fs.writeFileSync(srtFile, srtContent, 'utf8')

      // Use ASS file — reliable centering across all crop resolutions
      const escapedAss = assFile.replace(/\\/g, '/').replace(/:/g, '\\:')
      const fontsDirEscaped = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:')
      const fontsDirOption = `:fontsdir='${fontsDirEscaped}'`
      subtitleFilter = `-vf "ass='${escapedAss}'${fontsDirOption}"`
    }

    // Aspect ratio crop filter
    let cropFilter = ''
    if (aspectRatio === 'tiktok') {
      // 9:16 vertical - center crop
      cropFilter = 'crop=trunc(ih*9/16/2)*2:ih'
    } else if (aspectRatio === 'youtube_shorts') {
      // 1:1 square - center crop
      cropFilter = 'crop=min(iw\\,ih):min(iw\\,ih)'
    }
    // 'twitter' = 16:9 (usually already native), 'custom' = no crop

    // Build complete filter chain: crop → subtitles → watermark
    const watermarkPath = path.join(__dirname, 'watermark.png')
    const escapedWatermark = watermarkPath.replace(/\\/g, '/').replace(/:/g, '\\:')

    // Build filter chain step by step
    const filterParts = []

    // Start with video input
    let videoInput = '[0:v]'

    // Step 1: Crop (if needed)
    if (cropFilter) {
      filterParts.push(`${videoInput}${cropFilter}[cropped]`)
      videoInput = '[cropped]'
    }

    // Step 2: subtitles and optional watermark
    if (watermarkEnabled) {
      filterParts.push(`movie='${escapedWatermark}',scale=iw*0.15:-1,format=rgba,colorchannelmixer=aa=0.80[logo]`)
      filterParts.push(`${videoInput}[logo]overlay=W-w-8:H-h-4:format=auto,format=yuv420p[out]`)
    } else if (cropFilter) {
      filterParts.push(`${videoInput}format=yuv420p[out]`)
    }

    const filterComplexStr = filterParts.join(';')

    let filterChain = ''
    if (subtitleFilter) {
      // Merge subtitles INTO the filter_complex chain (can't mix -filter_complex and -vf)
      // Extract ASS file path from subtitleFilter
      const assMatch = subtitleFilter.match(/ass='([^']+)'/)
      const subsMatch = assMatch ? [null, assMatch[1]] : subtitleFilter.match(/subtitles='([^']+)'[^"]*force_style='([^']+)'/)
      if (subsMatch) {
        const assPath = assMatch ? subsMatch[1] : null
        const srtPath = !assMatch ? subsMatch[1] : null
        const styleStr = !assMatch ? subsMatch[2] : null
        // Inject subtitles filter between crop and watermark
        const fontsDirEscaped2 = path.join(__dirname, 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:')
        const subsNode = assPath
          ? `ass='${assPath}':fontsdir='${fontsDirEscaped2}'`
          : `subtitles='${srtPath}':force_style='${styleStr}'`
        // Rebuild: crop → subtitles → watermark
        const rebuildParts = []
        let inp = '[0:v]'
        if (cropFilter) {
          rebuildParts.push(`${inp}${cropFilter}[cropped]`)
          inp = '[cropped]'
        }
        rebuildParts.push(`${inp}${subsNode}[subbed]`)
        if (watermarkEnabled) {
          rebuildParts.push(`movie='${escapedWatermark}',scale=iw*0.15:-1,format=rgba,colorchannelmixer=aa=0.80[logo]`)
          rebuildParts.push(`[subbed][logo]overlay=W-w-8:H-h-4:format=auto,format=yuv420p[out]`)
        } else {
          rebuildParts.push(`[subbed]format=yuv420p[out]`)
        }
        filterChain = `-filter_complex "${rebuildParts.join(';')}" -map "[out]" -map 0:a`
      } else {
        // Fallback: just subtitles, no watermark
        filterChain = `${subtitleFilter} -map 0:a`
      }
    } else {
      if (watermarkEnabled || cropFilter) {
        filterChain = `-filter_complex "${filterComplexStr}" -map "[out]" -map 0:a`
      } else {
        filterChain = '-map 0:v -map 0:a'
      }
    }

    // FFmpeg: seek to start, cut for duration, apply filters, re-encode to MP4
    const requestedSource = sourceUrl.split('#')[0]
    const clipInput = resolveClipInputPath(requestedSource)
    if (clipInput !== requestedSource) {
      console.log(`[clip] using local source file: ${clipInput}`)
    }

    await new Promise((resolve, reject) => {
      const cmd = `ffmpeg -ss ${startTime} -i "${clipInput}" -t ${duration} ${filterChain} -c:v libx264 -c:a aac -movflags +faststart -y "${outputFile}"`
      console.log(`[clip] ffmpeg: ${cmd}`)

      exec(cmd, { timeout: 180000 }, (err, stdout, stderr) => {
        if (err) {
          console.error('[clip] ffmpeg error:', stderr?.slice(-500))
          reject(new Error('FFmpeg clipping failed'))
          return
        }
        resolve()
      })
    })

    if (!fs.existsSync(outputFile)) {
      return sendJson(res, 500, { error: 'Clip file not created' })
    }

    const stat = fs.statSync(outputFile)
    console.log(`[clip] done: ${(stat.size / 1024 / 1024).toFixed(1)}MB`)

    // Stream the file as download
    const safeName = (title || `clip-${startTime}s-${endTime}s`).replace(/[^a-zA-Z0-9_-]/g, '_')
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${safeName}.mp4"`,
      'Access-Control-Allow-Origin': '*',
    })

    const stream = fs.createReadStream(outputFile)
    stream.pipe(res)
    stream.on('end', () => {
      try { fs.unlinkSync(outputFile) } catch {}
      try { fs.unlinkSync(srtFile) } catch {}
    })
    stream.on('error', () => {
      try { fs.unlinkSync(outputFile) } catch {}
      try { fs.unlinkSync(srtFile) } catch {}
      res.end()
    })

  } catch (err) {
    console.error(`[clip] ERROR:`, err.message)
    try { fs.unlinkSync(outputFile) } catch {}
    try { fs.unlinkSync(srtFile) } catch {}
    sendJson(res, 500, { error: err.message })
  }
}

function applySubtitleTextCase(text, textCase = 'original') {
  if (textCase === 'upper') return text.toUpperCase()
  if (textCase === 'title') return text.replace(/\b\w/g, c => c.toUpperCase())
  return text
}

function escapeAssText(text = '') {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
}

function containsEmoji(text = '') {
  return /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(String(text))
}

function formatAssWordText(text = '', textCase = 'original') {
  const formatted = escapeAssText(applySubtitleTextCase(text || '', textCase))
  // Browser preview uses the system emoji font. Without this override, libass tries
  // to render emoji through the selected subtitle font, which can produce a
  // different-looking glyph in exported clips.
  if (containsEmoji(formatted)) return `{\\fnSegoe UI Emoji}${formatted}{\\rDefault}`
  return formatted
}

function toAssTime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const cs = Math.round((sec % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function getAssCueEnd(start, fallbackEnd, nextStart = null) {
  const minDuration = 0.05
  if (Number.isFinite(nextStart)) {
    const endBeforeNextCue = nextStart - 0.02
    if (endBeforeNextCue > start) return Math.max(start + minDuration, endBeforeNextCue)
    return start + minDuration
  }

  const end = Number.isFinite(fallbackEnd) ? fallbackEnd : start + 0.18
  return Math.max(start + minDuration, end)
}

function normalizeSubtitleWords(words = []) {
  return [...words]
    .filter((word) => typeof word?.start === 'number' && typeof word?.end === 'number' && typeof word?.text === 'string')
    .sort((a, b) => (a.start - b.start) || (a.end - b.end))
}

const CURSE_EMOJIS = ['🤬', '😼', '💥', '🙀']
const PROFANITY_PATTERNS = [
  /^f+u*c+k+(?:er|ers|ed|ing)?$/i,
  /^s+h+i+t+(?:ty|ting|ted)?$/i,
  /^b+i+t+c+h+(?:es|ing)?$/i,
  /^a+s+s+(?:hole|holes)?$/i,
  /^d+a+m+n+(?:ed|ing)?$/i,
  /^c+r+a+p+$/i,
  /^b+a+s+t+a+r+d+s?$/i,
  /^d+i+c+k+s?$/i,
  /^p+i+s+s+(?:ed|ing)?$/i,
  /^c+u+n+t+s?$/i,
  /^m+o+t+h+e+r+f+u*c+k+e*r*s?$/i,
]

function isProfaneSubtitleToken(text = '') {
  const normalized = String(text).toLowerCase().replace(/[^a-z0-9]/g, '')
  return Boolean(normalized) && PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized))
}

function censorSubtitleWords(words = []) {
  let hitIndex = 0
  return words.map((word) => {
    if (!isProfaneSubtitleToken(word.text || '')) return word
    const text = CURSE_EMOJIS[hitIndex % CURSE_EMOJIS.length]
    hitIndex += 1
    return { ...word, text }
  })
}

function groupSubtitleWords(words) {
  const orderedWords = normalizeSubtitleWords(Array.isArray(words) ? words : [])
  if (orderedWords.length === 0) return []

  const groups = []
  let cursor = 0

  while (cursor < orderedWords.length) {
    const group = [orderedWords[cursor]]
    const groupStart = orderedWords[cursor].start
    cursor += 1

    while (cursor < orderedWords.length) {
      const previous = group[group.length - 1]
      const next = orderedWords[cursor]
      const gap = next.start - previous.end
      const duration = next.end - groupStart
      if (previous.breakAfter || group.length >= 6 || gap > 0.75 || duration > 3.2) break
      group.push(next)
      cursor += 1
    }

    groups.push(group)
  }

  return groups
}

function buildAssAnimationTag(animationPreset = 'pop') {
  if (animationPreset === 'fade') return '{\\alpha&H88&\\t(0,220,\\alpha&H00&)}'
  if (animationPreset === 'none') return ''
  return '{\\fscx72\\fscy72\\t(0,170,\\fscx100\\fscy100)}'
}

function buildAssDialogueLines(words, { textCase = 'original', mode = 'phrase', animationPreset = 'pop', baseColour = '&H00FFFFFF', highlightColour = '&H0000EBFF', activeWordStyle = 'pill' } = {}) {
  const animationTag = buildAssAnimationTag(animationPreset)
  const orderedWords = normalizeSubtitleWords(words)
  const highlightTag = activeWordStyle === 'underline'
    ? `{\\c${highlightColour}\\u1}`
    : activeWordStyle === 'scale'
      ? `{\\c${highlightColour}\\fscx116\\fscy116}`
      : activeWordStyle === 'color'
        ? `{\\c${highlightColour}}`
        : `{\\c${highlightColour}\\3c&H00333333&\\bord4\\fscx112\\fscy112}`
  const resetTag = `{\\rDefault\\c${baseColour}}`

  if (mode === 'word_pop') {
    return orderedWords.map((word, index) => {
      const nextWord = orderedWords[index + 1]
      const start = word.start
      const end = getAssCueEnd(start, word.end + 0.18, nextWord?.start)
      const text = formatAssWordText(word.text || '', textCase)
      return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${animationTag}${text}`
    })
  }

  const groupedWords = groupSubtitleWords(orderedWords)

  if (mode === 'active_word') {
    const lines = []
    for (const group of groupedWords) {
      for (let index = 0; index < group.length; index += 1) {
        const word = group[index]
        const nextWord = group[index + 1]
        const start = word.start
        const end = getAssCueEnd(start, word.end + 0.18, nextWord?.start)
        const text = group.map((entry, entryIndex) => {
          const escaped = formatAssWordText(entry.text || '', textCase)
          return entryIndex === index ? `${highlightTag}${escaped}${resetTag}` : escaped
        }).join(' ')
        lines.push(`Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${animationTag}${text}`)
      }
    }
    return lines
  }

  if (mode === 'karaoke') {
    return groupedWords.map((group) => {
      const start = group[0].start
      const end = group[group.length - 1].end
      const text = group.map((word) => {
        const durationCs = Math.max(1, Math.round(Math.max(0.08, word.end - word.start) * 100))
        return `{\\k${durationCs}}${formatAssWordText(word.text || '', textCase)}`
      }).join(' ')
      return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${animationTag}${text}`
    })
  }

  return groupedWords.map((group) => {
    const start = group[0].start
    const end = group[group.length - 1].end
    const text = group.map((word) => formatAssWordText(word.text || '', textCase)).join(' ')
    return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${animationTag}${text}`
  })
}

/**
 * Generate SRT subtitle content from word-level timestamps.
 * Groups words into readable chunks with real pause gaps preserved.
 * Timestamps are relative (0-based for the clip).
 */
function generateSRT(words, clipStartTime = 0, textCase = 'original') {
  const chunks = groupSubtitleWords(normalizeSubtitleWords(words)).map((group) => {
    const text = group.map((word) => applySubtitleTextCase(word.text || '', textCase)).join(' ')
    const start = group[0].start - clipStartTime
    const end = (group[group.length - 1].end || group[group.length - 1].start + 0.5) - clipStartTime
    return { text, start: Math.max(0, start), end: Math.max(0, end) }
  })

  return chunks.map((chunk, i) => {
    const fmtTime = (s) => {
      const hrs = Math.floor(s / 3600)
      const mins = Math.floor((s % 3600) / 60)
      const secs = Math.floor(s % 60)
      const ms = Math.floor((s % 1) * 1000)
      return `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')},${String(ms).padStart(3,'0')}`
    }
    return `${i + 1}\n${fmtTime(chunk.start)} --> ${fmtTime(chunk.end)}\n${chunk.text}`
  }).join('\n\n')
}

// Create server
const server = http.createServer((req, res) => {
  // CORS preflight
// Transcription cache: keyed by source URL hash, persists across restarts
const TRANSCRIPTION_CACHE_DIR = path.join(TEMP_DIR, 'transcription-cache')
if (!fs.existsSync(TRANSCRIPTION_CACHE_DIR)) fs.mkdirSync(TRANSCRIPTION_CACHE_DIR, { recursive: true })

function getTranscriptionCacheKey(audioUrl) {
  // Strip session tokens so same broadcast always hits cache regardless of token rotation
  // YouTube: remove ?t=... &s=... params. X broadcasts: extract broadcast ID
  let normalized = audioUrl
  try {
    const u = new URL(audioUrl)
    // X broadcasts: key on the broadcast ID only (1qGvvkWagaaGB)
    const xBroadcastMatch = u.pathname.match(/\/i\/broadcasts\/([a-zA-Z0-9]+)/)
    if (xBroadcastMatch) {
      normalized = `x-broadcast:${xBroadcastMatch[1]}`
    } else if (u.hostname.includes('youtube') || u.hostname.includes('youtu.be')) {
      // YouTube: key on video ID only
      const videoId = u.searchParams.get('v') || u.pathname.split('/').pop()
      normalized = `youtube:${videoId}`
    } else if (u.hostname.includes('trycloudflare') || u.hostname.includes('cloudflare')) {
      // Cloudflare serve URLs include a random file prefix. Normalize to the stable media id suffix.
      const fileName = decodeURIComponent(u.pathname.split('/').pop() || '')
      const stem = fileName.replace(/\.[^.]+$/, '')
      const stableId = stem.replace(/^[a-f0-9]+-/, '')
      normalized = stableId ? `serve:${stableId}` : audioUrl
    }
    // Remove t= and s= session params from any URL
    u.searchParams.delete('t')
    u.searchParams.delete('s')
    if (!xBroadcastMatch && !u.hostname.includes('youtube')) {
      normalized = u.toString()
    }
  } catch {}
  return require('crypto').createHash('md5').update(normalized).digest('hex')
}

function getCachedTranscription(audioUrl) {
  const key = getTranscriptionCacheKey(audioUrl)
  const file = path.join(TRANSCRIPTION_CACHE_DIR, `${key}.json`)
  if (fs.existsSync(file)) {
    console.log(`[transcription-cache] HIT: ${key} for ${audioUrl.slice(0, 60)}...`)
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }
  return null
}

function setCachedTranscription(audioUrl, result) {
  const key = getTranscriptionCacheKey(audioUrl)
  const file = path.join(TRANSCRIPTION_CACHE_DIR, `${key}.json`)
  fs.writeFileSync(file, JSON.stringify(result))
  console.log(`[transcription-cache] SET: ${key} (${result.words?.length || 0} words)`)
}

// Active transcriptions: persisted to disk so they survive restarts
const TRANSCRIPTION_DIR = path.join(TEMP_DIR, 'transcriptions')
if (!fs.existsSync(TRANSCRIPTION_DIR)) fs.mkdirSync(TRANSCRIPTION_DIR, { recursive: true })

function getTranscription(id) {
  const file = path.join(TRANSCRIPTION_DIR, `${id}.json`)
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'))
  return null
}

function setTranscription(id, data) {
  const file = path.join(TRANSCRIPTION_DIR, `${id}.json`)
  fs.writeFileSync(file, JSON.stringify(data))
}

function resolveServedFilePath(audioUrl, explicitPath) {
  if (explicitPath) return explicitPath
  if (!audioUrl) return null
  if (audioUrl.includes('/serve/')) {
    const fileName = audioUrl.split('/serve/').pop()?.split(/[?#]/)[0]
    if (!fileName) return null
    return path.join(TEMP_DIR, decodeURIComponent(fileName))
  }
  return null
}

function detectVolumeSpikesForFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return []
  try {
    const { analyzeAudioEnergy, findVolumeSpikes } = require('./audio-energy')
    const segments = analyzeAudioEnergy(filePath, 3)
    const spikes = findVolumeSpikes(segments, 4)
    return clusterAudioActionSpikes(spikes, 9).slice(0, 80)
  } catch (error) {
    console.error('[audio-energy] Failed:', error.message)
    return []
  }
}

function clusterAudioActionSpikes(spikes, gapSec = 9) {
  const sorted = [...(spikes || [])].sort((a, b) => a.startSec - b.startSec)
  const clusters = []

  for (const spike of sorted) {
    const last = clusters[clusters.length - 1]
    if (!last || spike.startSec - last.endSec > gapSec) {
      clusters.push({
        startSec: spike.startSec,
        endSec: spike.endSec,
        spikeLevel: spike.spikeLevel || 0,
        spikeCount: 1,
      })
    } else {
      last.endSec = Math.max(last.endSec, spike.endSec)
      last.spikeLevel = Math.max(last.spikeLevel, spike.spikeLevel || 0)
      last.spikeCount += 1
    }
  }

  return clusters
    .map((cluster) => ({
      ...cluster,
      actionScore: (cluster.spikeLevel || 0) + cluster.spikeCount * 3,
    }))
    .sort((a, b) => b.actionScore - a.actionScore)
}

const GENRE_SIGNAL_PACKS = {
  general_gaming: {
    hardAction: ['ace', 'beam', 'clutch', 'double kill', 'downed one', 'eliminated', 'first kill', 'fought him off', 'fought them off', 'got em', 'got him', 'got one', 'headshot', 'he is dead', "he's dead", 'killed', 'killing frenzy', 'killing spree', 'knocked', 'one down', 'one shot', 'outplayed', 'picked him', 'snipe', 'squad wipe', 'team wipe', 'triple kill', 'wiped'],
    objective: ['captured', 'captured the flag', 'caps the flag', 'champion', 'defuse', 'exfil', 'final circle', 'first blood', 'flag secured', 'got our flag', 'payload', 'planted', 'qualified', 'raid complete', 'round won', 'secured', 'victory', 'wave cleared', 'we won'],
    reaction: ['clip that', 'holy', 'insane', 'let\'s go', 'no way', 'oh my god', 'oh shit', 'what just happened', 'yo'],
    funny: ['bruh', 'haha', 'i\'m dead', 'im dead', 'lmao', 'no shot', 'wtf'],
    negative: ['afk', 'audio settings', 'chat', 'follow the stream', 'loading', 'lobby', 'menu', 'queue', 'queueing', 'sensitivity', 'settings', 'sub goal', 'thanks for the follow', 'thanks for watching'],
  },
  shooter: {
    hardAction: ['beam', 'cracked', 'downed one', 'first kill', 'full team', 'got him', 'got one', 'headshot', 'knocked', 'one clip', 'one shot', 'push that', 'rezzing', 'squad wipe', 'swinging'],
    objective: ['clutched the round', 'defuse', 'planted', 'retake', 'round win', 'site take'],
    reaction: ['he\'s one', 'i fried him', 'no way', 'what a shot'],
    funny: ['ain\'t no way', 'bro'],
    negative: ['buy round', 'econ', 'loadout', 'rotating late', 'settings'],
  },
  extraction_shooter: {
    hardAction: ['beam', 'cracked', 'downed', 'got him', 'he\'s dead', 'last guy', 'one shot', 'pushed them', 'wiped'],
    objective: ['bag is full', 'extract', 'exfil', 'get out', 'get to extract', 'loot', 'raid complete', 'stash', 'third party'],
    reaction: ['holy', 'let\'s leave', 'we got it', 'we\'re rich'],
    funny: ['no shot'],
    negative: ['inventory', 'loadout', 'selling', 'sorting loot'],
  },
  battle_royale: {
    hardAction: ['cracked', 'full team', 'got height', 'knocked', 'last duo', 'last team', 'one shot', 'reboot', 'third party', 'wiped'],
    objective: ['champion', 'final circle', 'rotation', 'storm', 'zone'],
    reaction: ['let\'s go', 'we win this'],
    funny: ['bruh'],
    negative: ['farming mats', 'looting up', 'rotating', 'settings'],
  },
  sports: {
    hardAction: ['buzzer beater', 'clutch shot', 'goal', 'header', 'poster', 'save', 'scored', 'slam', 'steal', 'three pointer'],
    objective: ['equalizer', 'game winner', 'overtime', 'playoffs', 'win it'],
    reaction: ['crowd is going crazy', 'no way', 'what a play'],
    funny: ['ankles'],
    negative: ['timeout', 'warmup'],
  },
  social_sandbox: {
    hardAction: ['boss fight', 'chain it', 'clear the wave', 'combo', 'fight back', 'got the boss'],
    objective: ['event clear', 'farm run', 'flag secured', 'guild win', 'island run', 'portal', 'quest done', 'wave cleared'],
    reaction: ['that was clean', 'that was sick', 'let\'s go'],
    funny: ['bruh', 'lmao'],
    negative: ['building mode', 'decorating', 'inventory', 'quest text', 'shopping'],
  },
  survival_crafting: {
    hardAction: ['boss', 'countered', 'raided', 'rocketed', 'took him out', 'won the fight'],
    objective: ['base defense', 'farm run', 'got the loot', 'locked in', 'survived the night'],
    reaction: ['holy', 'we\'re up', 'yo'],
    funny: ['what are you doing'],
    negative: ['crafting', 'farming', 'inventory', 'organizing', 'recipe'],
  },
}

const KNOWN_GAME_HINTS = [
  { game: 'Nifty Island', genrePack: 'general_gaming', signatures: ['nifty island', 'island raiders', 'cave fins', 'pirates', 'raid complete', 'wave cleared', 'wave survived', 'high five', 'checkpoint', 'checkpoints', 'palm logo', 'glove box', 'no friends'] },
  { game: 'Pixels', genrePack: 'social_sandbox', signatures: ['pixels', 'farm land', 'berry', 'task board', 'grinding pixels'] },
  // Avoid matching generic "raider/raiders" alone: MCV's Nifty show is called Island Raiders.
  { game: 'ARC Raiders', genrePack: 'extraction_shooter', signatures: ['arc raiders', 'arc raider', 'extract', 'exfil', 'wild zone'] },
  { game: 'Valorant', genrePack: 'shooter', signatures: ['valorant', 'spike planted', 'ace', 'site take', 'clutched the round'] },
  { game: 'Apex Legends', genrePack: 'battle_royale', signatures: ['apex', 'rez beacon', 'champion', 'third party', 'cracked shield'] },
  { game: 'Fortnite', genrePack: 'battle_royale', signatures: ['fortnite', 'storm', 'boxed', 'crown win', 'reboot van'] },
  { game: 'Call of Duty', genrePack: 'shooter', signatures: ['call of duty', 'warzone', 'gulag', 'loadout', 'uav'] },
  { game: 'Overwatch', genrePack: 'shooter', signatures: ['overwatch', 'payload', 'nano', 'ult', 'point unlocked'] },
  { game: 'League of Legends', genrePack: 'general_gaming', signatures: ['league', 'baron', 'dragon', 'ace them', 'nexus'] },
  { game: 'Minecraft', genrePack: 'survival_crafting', signatures: ['minecraft', 'creeper', 'ender dragon', 'nether', 'redstone'] },
]

const MODE_SIGNAL_PACKS = {
  default: { boost: [], negative: [] },
  gaming: {
    boost: ['ace', 'clutch', 'headshot', 'knocked', 'squad wipe', 'team wipe', 'we won'],
    negative: ['explaining', 'strategy talk', 'waiting room'],
  },
  funny: {
    boost: ['bruh', 'haha', 'i\'m dead', 'im dead', 'lmao', 'no shot', 'wtf'],
    negative: ['quiet moment'],
  },
  conversation: {
    boost: ['crazy story', 'honestly', 'i think', 'let me tell you', 'remember when', 'real talk', 'that reminds me'],
    negative: ['dead air', 'loading screen', 'menuing'],
  },
}

const GENRE_PACK_LABELS = {
  general_gaming: 'general gaming',
  shooter: 'shooter',
  extraction_shooter: 'extraction shooter',
  battle_royale: 'battle royale',
  sports: 'sports',
  social_sandbox: 'social sandbox',
  survival_crafting: 'survival / crafting',
}

const PRIORITY_HINT_SIGNAL_TERMS = {
  action: ['ace', 'boss', 'capture', 'captured', 'clutch', 'combo', 'comeback', 'double kill', 'downed one', 'fight back', 'first kill', 'flag', 'goal', 'got one', 'headshot', 'kill', 'killing frenzy', 'killing spree', 'knocked', 'objective', 'raid', 'save', 'score', 'scored', 'steal', 'stole', 'team wipe', 'triple kill', 'victory', 'wave cleared', 'we won', 'wiped', 'win'],
  reaction: ['celebration', 'comeback', 'hype', 'pop off', 'reaction', 'rage', 'scream', 'trash talk'],
  funny: ['fail', 'funny', 'laugh', 'lmao', 'wtf'],
  conversation: ['dialogue', 'discussion', 'quote', 'speech', 'story', 'take'],
}

const ACTION_SHOT_TERMS = [
  'caps the flag',
  'double kill',
  'downed one',
  'first blood',
  'first kill',
  'flag secured',
  'fought him off',
  'fought them off',
  'got the flag',
  'got our flag',
  'fried him',
  'fried them',
  'grabbed the flag',
  'got em',
  'got him',
  'got one',
  'got two',
  'got taken out',
  'headshot',
  'he\'s dead',
  'killed one',
  'killed two',
  'killing frenzy',
  'killing spree',
  'one down',
  'one shot',
  'picked him',
  'picked him off',
  'picked one',
  'picked one off',
  'picked off',
  'revenge',
  'sniped him',
  'sniped one',
  'stole the flag',
  'team wipe',
  'they\'re dead',
  'triple kill',
  'wiped',
]

const ACTION_SHOT_PATTERNS = [
  { label: 'caps the flag', pattern: /\bcaps? the flag\b/ },
  { label: 'fought them off', pattern: /\bfought (?:him|her|them) off\b/ },
  { label: 'got someone', pattern: /\bgot (?:him|her|them|em|one|two|another)\b/ },
  { label: 'got our flag', pattern: /\b(?:they|we) got (?:our|the) flag\b/ },
  { label: 'taken out', pattern: /\b(?:got )?taken out\b/ },
  { label: 'flag secured', pattern: /\bflag (?:secured|captured|returned|stolen|grabbed)\b/ },
  { label: 'got the flag', pattern: /\b(?:got|grabbed|stole) the flag\b/ },
  { label: 'flag carrier down', pattern: /\bflag carrier (?:down|dead|gone)\b/ },
  { label: 'revenge call', pattern: /\b(?:revenge|avenge me)\b/ },
  { label: 'picked off', pattern: /\bpicked (?:him|her|them|one|two)(?: off)?\b/ },
  { label: 'downed someone', pattern: /\bdowned (?:him|her|them|one|two)\b/ },
  { label: 'sniped someone', pattern: /\bsniped (?:him|her|them|one|two)\b/ },
  { label: 'one down', pattern: /\bone down\b/ },
  { label: 'hes gone', pattern: /\bhe'?s gone\b/ },
  { label: 'bang payoff', pattern: /\bbang\b/ },
  { label: 'far away shot', pattern: /\bfrom far away\b/ },
]

const MUSIC_LYRIC_TERMS = ['anthem', 'blessing', 'blessed', 'chorus', 'groovin', 'grooving', 'lyrics', 'melody', 'paradise', 'rhythm', 'singing', 'studio', 'verse']

function parsePriorityHintPhrases(raw) {
  return [...new Set(String(raw || '')
    .split(/[\n,;|/]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .filter((part) => part.length >= 3)
    .filter((part) => part.split(/\s+/).length <= 6))]
}

function buildPriorityProfile(priorityHint, detectionMode) {
  const raw = String(priorityHint || '').trim().toLowerCase()
  const exactPhrases = parsePriorityHintPhrases(raw)
  if (!raw) {
    return {
      raw: '',
      exactPhrases: [],
      gameplayRequested: detectionMode === 'gaming',
      matches: { action: [], reaction: [], funny: [], conversation: [] },
    }
  }

  const matches = {
    action: uniqueMatches(raw, PRIORITY_HINT_SIGNAL_TERMS.action),
    reaction: uniqueMatches(raw, PRIORITY_HINT_SIGNAL_TERMS.reaction),
    funny: uniqueMatches(raw, PRIORITY_HINT_SIGNAL_TERMS.funny),
    conversation: uniqueMatches(raw, PRIORITY_HINT_SIGNAL_TERMS.conversation),
  }

  return {
    raw,
    exactPhrases,
    gameplayRequested: detectionMode === 'gaming',
    actionPriorityRequested: matches.action.length > 0,
    matches,
  }
}

function hasActionPriority(priorityProfile) {
  return Boolean(priorityProfile?.actionPriorityRequested || priorityProfile?.matches?.action?.length)
}

function getPriorityMatches(text, priorityProfile) {
  if (!priorityProfile?.raw) return []
  return uniqueMatches(text, [
    ...(priorityProfile.exactPhrases || []),
    ...priorityProfile.matches.action,
    ...priorityProfile.matches.reaction,
    ...priorityProfile.matches.funny,
    ...priorityProfile.matches.conversation,
  ])
}

function filterHardActionMatches(matches, text) {
  const lowered = String(text || '').toLowerCase()
  return matches.filter((term) => {
    if (term === 'got him' || term === 'got em') {
      if (/\bgot (?:him|em)\s+(trained|training|set up|setup|working|configured|building|editing|to)\b/.test(lowered)) return false
      return true
    }

    if (term === 'got one') {
      if (/\bgot one\s+(dark\s+fish|fish|button|buttons|link|links|art|generation|generations|training|trained)\b/.test(lowered)) return false
      return /\bgot one(?:\b|[!.,?])/.test(lowered)
    }

    return true
  })
}

function filterObjectiveMatches(matches, text) {
  const lowered = String(text || '').toLowerCase()
  return matches.filter((term) => {
    if (term === 'exfil') {
      return /\b(exfil|get out|get to extract|leave|loot|stash|bag is full|we\'re rich|were rich|third party)\b/.test(lowered)
    }

    return true
  })
}

function getActionShotMatches(text) {
  const lowered = String(text || '').toLowerCase()
  const phraseMatches = uniqueMatches(lowered, ACTION_SHOT_TERMS)
  const patternMatches = ACTION_SHOT_PATTERNS
    .filter(({ pattern }) => pattern.test(lowered))
    .map(({ label }) => label)

  return [...new Set([...phraseMatches, ...patternMatches])]
}

function isCelebrationAftermathLike(text) {
  return /(gg'?s?(?:,?\s+(?:guys|everyone|boys|bro))?|good shit|good stuff|high five|let'?s fucking go|lets fucking go|nice(?:\s+job)?|we got it|they got it|did we win|we won|blue flag\b|red flag\b)/.test(String(text || '').toLowerCase())
}

function isMusicLikeChunk(text) {
  const lyricHits = uniqueMatches(text, MUSIC_LYRIC_TERMS)
  if (lyricHits.length >= 2) return true
  if (/(singing|lyrics|chorus|verse)/.test(text)) return true
  return /(rhythm|melody|paradise|blessing|blessed|studio|groovin|grooving)/.test(text)
}

function formatClock(sec) {
  const total = Math.max(0, Math.round(sec))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function sanitizeTranscriptToken(text) {
  const token = (text || '').trim()
  if (!token || token.startsWith('[') || token.startsWith('(')) return ''
  return token
}

function buildTranscriptSegments(words, segmentSec = 10) {
  const segments = []
  let segStart = 0
  let segWords = []

  for (const word of words) {
    const token = sanitizeTranscriptToken(word.text)
    if (!token) continue

    const wordSec = word.start / 1000
    if (wordSec >= segStart + segmentSec) {
      if (segWords.length > 0) {
        segments.push({ startSec: segStart, text: segWords.join(' ') })
      }
      segStart = Math.floor(wordSec / segmentSec) * segmentSec
      segWords = []
    }

    segWords.push(token)
  }

  if (segWords.length > 0) {
    segments.push({ startSec: segStart, text: segWords.join(' ') })
  }

  return segments
}

function sampleSegmentsEvenly(segments, maxTotal = 120, sections = 10) {
  if (segments.length <= maxTotal) return segments

  const sampled = []
  const segsPerSection = Math.max(1, Math.floor(maxTotal / sections))
  const sectionSize = Math.ceil(segments.length / sections)

  for (let sectionIndex = 0; sectionIndex < sections; sectionIndex += 1) {
    const start = sectionIndex * sectionSize
    const end = Math.min(start + sectionSize, segments.length)
    const sectionSegs = segments.slice(start, end)
    const step = Math.max(1, Math.ceil(sectionSegs.length / segsPerSection))

    for (let i = 0; i < sectionSegs.length; i += step) {
      sampled.push(sectionSegs[i])
    }
  }

  return sampled.slice(0, maxTotal)
}

function buildEventChunks(words, introSkipSec, totalSec) {
  const chunks = []
  let current = null

  for (const word of words) {
    const token = sanitizeTranscriptToken(word.text)
    if (!token) continue

    const startSec = word.start / 1000
    const endSec = word.end / 1000
    if (startSec < introSkipSec || startSec > totalSec) continue

    if (!current) {
      current = { startSec, endSec, words: [token] }
      continue
    }

    const gapSec = Math.max(0, startSec - current.endSec)
    const nextDuration = endSec - current.startSec
    const longPause = gapSec >= 1.35
    const tooLong = nextDuration >= 18

    if (longPause || tooLong) {
      chunks.push(current)
      current = { startSec, endSec, words: [token] }
      continue
    }

    current.endSec = endSec
    current.words.push(token)
  }

  if (current) chunks.push(current)

  const merged = []
  for (const chunk of chunks) {
    const previous = merged[merged.length - 1]
    if (
      previous &&
      chunk.startSec - previous.endSec <= 1.25 &&
      chunk.endSec - previous.startSec <= 20
    ) {
      previous.endSec = chunk.endSec
      previous.words.push(...chunk.words)
      continue
    }

    merged.push({ ...chunk, words: [...chunk.words] })
  }

  return merged
    .map((chunk) => ({
      ...chunk,
      durationSec: parseFloat((chunk.endSec - chunk.startSec).toFixed(2)),
      text: chunk.words.join(' '),
    }))
    .filter((chunk) => chunk.durationSec >= 4 && chunk.words.length >= 4)
}

function normalizeGenrePack(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_+|_+$/g, '')
  if (!normalized) return 'general_gaming'
  if (GENRE_SIGNAL_PACKS[normalized]) return normalized
  if (normalized.includes('extract')) return 'extraction_shooter'
  if (normalized.includes('battle') || normalized.includes('royale')) return 'battle_royale'
  if (normalized.includes('social') || normalized.includes('sandbox')) return 'social_sandbox'
  if (normalized.includes('survival') || normalized.includes('craft')) return 'survival_crafting'
  if (normalized.includes('sport')) return 'sports'
  if (normalized.includes('shoot')) return 'shooter'
  return 'general_gaming'
}

function detectGameBySignatures(segmentsText) {
  const haystack = String(segmentsText || '').toLowerCase()
  let best = null

  for (const hint of KNOWN_GAME_HINTS) {
    const hits = hint.signatures.filter((signature) => haystack.includes(signature))
    if (!hits.length) continue
    if (!best || hits.length > best.hitCount) {
      best = { ...hint, hitCount: hits.length }
    }
  }

  return best
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function uniqueMatches(text, phrases) {
  const haystack = String(text || '').toLowerCase()
  return [...new Set((phrases || []).filter((phrase) => {
    const normalized = String(phrase || '').trim().toLowerCase()
    if (!normalized) return false
    const pattern = normalized
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegex)
      .join('\\s+')
    return new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, 'i').test(haystack)
  }))]
}

function scoreEventChunk(chunk, volumeSpikes, genrePack, detectionMode, priorityProfile) {
  const pack = GENRE_SIGNAL_PACKS[normalizeGenrePack(genrePack)] || GENRE_SIGNAL_PACKS.general_gaming
  const modePack = MODE_SIGNAL_PACKS[detectionMode] || MODE_SIGNAL_PACKS.default
  const text = chunk.text.toLowerCase()

  const hardActionHits = filterHardActionMatches(
    uniqueMatches(text, [...GENRE_SIGNAL_PACKS.general_gaming.hardAction, ...pack.hardAction]),
    text,
  )
  const objectiveHits = filterObjectiveMatches(
    uniqueMatches(text, [...GENRE_SIGNAL_PACKS.general_gaming.objective, ...pack.objective]),
    text,
  )

  const hits = {
    hardAction: hardActionHits,
    objective: objectiveHits,
    reaction: uniqueMatches(text, [...GENRE_SIGNAL_PACKS.general_gaming.reaction, ...pack.reaction]),
    funny: uniqueMatches(text, [...GENRE_SIGNAL_PACKS.general_gaming.funny, ...pack.funny]),
    negative: uniqueMatches(text, [...GENRE_SIGNAL_PACKS.general_gaming.negative, ...pack.negative, ...modePack.negative]),
    modeBoost: uniqueMatches(text, modePack.boost),
  }

  const spikeHits = (volumeSpikes || []).filter((spike) => spike.startSec >= chunk.startSec - 2 && spike.startSec <= chunk.endSec + 2).length
  const density = chunk.words.length / Math.max(chunk.durationSec, 1)
  const actionShotMatches = filterHardActionMatches(getActionShotMatches(text), text)
  const hasGameplayPayoff = hits.hardAction.length + hits.objective.length + actionShotMatches.length > 0
  const priorityMatches = getPriorityMatches(text, priorityProfile)
  const actionPriorityBias = hasActionPriority(priorityProfile)
  const musicLike = isMusicLikeChunk(text)
  const aftermathLike = isCelebrationAftermathLike(text)
  const reactionOnlyPenalty = !hasGameplayPayoff && hits.reaction.length > 0 ? 8 : 0
  const aftermathPenalty = aftermathLike && hits.hardAction.length === 0 && actionShotMatches.length === 0 ? 10 : 0
  const calibrationPenalty = hits.negative.length * 11 + reactionOnlyPenalty
  const actionCoverage = hits.hardAction.length + hits.objective.length + hits.modeBoost.length + actionShotMatches.length
  const funnyCoverage = hits.funny.length
  const reactionCoverage = hits.reaction.length
  const signalDensity = actionCoverage + funnyCoverage + reactionCoverage + spikeHits
  const introLikeChunk = /(what's up|welcome back|today we're|stream today|we are live|starting soon|all right chat|alright chat)/.test(text)
  const weakPayoffPenalty = !hasGameplayPayoff && spikeHits === 0 ? 10 : 0
  const chatterPenalty = density < 1.6 && signalDensity < 2 ? 6 : 0
  const durationBonus = chunk.durationSec >= 9 && chunk.durationSec <= 22 ? 6 : chunk.durationSec >= 6 && chunk.durationSec <= 28 ? 3 : -2
  const strictGameplayPenalty = priorityProfile?.gameplayRequested && !hasGameplayPayoff && hits.modeBoost.length === 0 ? 18 : 0
  const softActionPenalty = actionPriorityBias && detectionMode !== 'gaming' && !hasGameplayPayoff && funnyCoverage === 0 && reactionCoverage === 0 && spikeHits === 0 ? 6 : 0
  const actionPriorityBonus = actionPriorityBias && hasGameplayPayoff ? 6 : 0
  const musicPenalty = musicLike && (priorityProfile?.gameplayRequested || detectionMode === 'gaming') && !hasGameplayPayoff ? 24 : 0

  let score = 0
  score += hits.hardAction.length * 18
  score += hits.objective.length * 14
  score += hits.reaction.length * 4
  score += hits.funny.length * (detectionMode === 'funny' ? 10 : 5)
  score += hits.modeBoost.length * 8
  score += actionShotMatches.length * 8
  score += priorityMatches.length * 9
  score += actionPriorityBonus
  score += spikeHits * 9
  if (chunk.audioAction) score += Math.min(36, 16 + (chunk.audioActionScore || 0) * 2)
  score += Math.min(5, density)
  score += durationBonus
  score -= calibrationPenalty
  score -= weakPayoffPenalty
  score -= chatterPenalty
  score -= strictGameplayPenalty
  score -= softActionPenalty
  score -= musicPenalty
  score -= aftermathPenalty
  if (introLikeChunk) score -= 12

  return {
    ...chunk,
    score,
    spikeHits,
    hits,
    signalDensity,
    hasGameplayPayoff,
    actionShotMatches,
    priorityMatches,
    musicLike,
    aftermathLike,
    audioAction: Boolean(chunk.audioAction),
    audioActionScore: chunk.audioActionScore || 0,
  }
}

function isGameplayStrictMode(priorityProfile, detectionMode) {
  return Boolean(
    priorityProfile?.gameplayRequested ||
    priorityProfile?.actionPriorityRequested ||
    (priorityProfile?.matches?.action?.length ?? 0) > 0 ||
    detectionMode === 'gaming'
  )
}

function hasExplicitActionPriority(priorityProfile) {
  return Boolean(priorityProfile?.matches?.action?.length)
}

function getConcreteActionMatches(text, priorityProfile) {
  const lowered = String(text || '').toLowerCase()
  const clutchVerbLike = /\bclutched\b|\bclutch (play|plays|round|rounds|win|wins|shot|shots|kill|kills|moment|moments)\b/.test(lowered)
  const actionTerms = filterHardActionMatches(uniqueMatches(lowered, [
    ...GENRE_SIGNAL_PACKS.general_gaming.hardAction,
    ...(priorityProfile?.matches?.action || []),
  ]), lowered).filter((term) => term !== 'clutch' || clutchVerbLike)
  const objectiveTerms = filterObjectiveMatches(uniqueMatches(lowered, [...GENRE_SIGNAL_PACKS.general_gaming.objective]), lowered)
  const actionShotTerms = filterHardActionMatches(getActionShotMatches(lowered), lowered)
  const directActionTerms = [...new Set([...actionTerms, ...objectiveTerms, ...actionShotTerms])]

  return {
    actionTerms,
    objectiveTerms,
    actionShotTerms,
    directActionTerms,
  }
}

function passesGameplayPriorityGate(candidate, priorityProfile, detectionMode) {
  if (!candidate) return false

  const gameplayStrict = isGameplayStrictMode(priorityProfile, detectionMode)
  if (candidate.musicLike && gameplayStrict) return false

  const hardActionCount = candidate.hits?.hardAction?.length || 0
  const objectiveCount = candidate.hits?.objective?.length || 0
  const reactionCount = candidate.hits?.reaction?.length || 0
  const funnyCount = candidate.hits?.funny?.length || 0
  const priorityCount = candidate.priorityMatches?.length || 0
  const actionShotCount = candidate.actionShotMatches?.length || 0
  const concreteSignals = getConcreteActionMatches(candidate.text, priorityProfile)
  const actionPriorityCount = concreteSignals.actionTerms.filter((match) => priorityProfile?.matches?.action?.includes(match)).length
  const objectivePriorityCount = concreteSignals.objectiveTerms.filter((match) => priorityProfile?.matches?.action?.includes(match)).length
  const strongGameplaySignal = hardActionCount + objectiveCount + actionShotCount > 0 || concreteSignals.directActionTerms.length > 0
  const strongReactionBurst = reactionCount > 0 && (candidate.spikeHits > 0 || candidate.score >= 28)
  const funnyPayoff = funnyCount > 0 && (strongGameplaySignal || priorityCount > 0)
  const explicitActionPriority = hasExplicitActionPriority(priorityProfile)

  if (!gameplayStrict) {
    return candidate.score >= 12 || candidate.signalDensity >= 2 || strongGameplaySignal
  }

  if (explicitActionPriority && concreteSignals.directActionTerms.length === 0 && actionPriorityCount === 0 && objectivePriorityCount === 0) {
    return false
  }

  if (strongGameplaySignal) return true
  if (priorityCount > 0 && candidate.score >= 14) return true
  if (strongReactionBurst && candidate.score >= 20) return true
  if (funnyPayoff && candidate.score >= 22) return true
  return false
}

function findSupportingCandidate(scoredCandidates, startSec, clipLength) {
  const toleranceSec = Math.max(12, Math.round(clipLength * 0.75))
  return (scoredCandidates || [])
    .filter((candidate) => Math.abs(candidate.startSec - startSec) <= toleranceSec)
    .sort((a, b) => {
      const delta = Math.abs(a.startSec - startSec) - Math.abs(b.startSec - startSec)
      if (delta !== 0) return delta
      return b.score - a.score
    })[0] || null
}

function clipTextMatchesGameplayAsk(clipText, priorityProfile, detectionMode) {
  if (!isGameplayStrictMode(priorityProfile, detectionMode)) return true

  const text = String(clipText || '').toLowerCase()
  const farewellLike = /(catch you|ggs|good night|goodnight|see you|thanks man|thanks bro|take care)/.test(text)
  const aftermathLike = isCelebrationAftermathLike(text)
  const concreteSignals = getConcreteActionMatches(text, priorityProfile)
  const gameplayTerms = [...new Set([
    ...concreteSignals.actionTerms,
    ...concreteSignals.objectiveTerms,
    ...concreteSignals.actionShotTerms,
    ...uniqueMatches(text, priorityProfile?.matches?.action || []),
    ...uniqueMatches(text, priorityProfile?.matches?.reaction || []),
  ])]
  const actionTerms = concreteSignals.actionTerms
  const directActionTerms = concreteSignals.directActionTerms
  const nonClutchActionTerms = actionTerms.filter((term) => term !== 'clutch')
  const weakNearMiss = /(almost killed|almost got|almost had|nearly killed|nearly got)/.test(text)
  const strongActionWords = uniqueMatches(text, ['bang', 'clutch', 'double kill', 'flag secured', 'got the flag', 'grabbed the flag', 'killing frenzy', 'killing spree', 'stole the flag', 'got him', 'got me', 'headshot', 'killed me', 'sniper'])

  if (farewellLike && nonClutchActionTerms.length === 0) return false
  if (aftermathLike && directActionTerms.length === 0 && concreteSignals.objectiveTerms.length <= 1) return false
  if (hasExplicitActionPriority(priorityProfile) && directActionTerms.length === 0) {
    const actionAdjacentContext = /(avenge me|back me up|cover me|cover you|flag carrier|got the flag|grabbed the flag|he'?s low|he is low|on me|push that|stole the flag)/.test(text)
    if (!actionAdjacentContext) return false
  }
  if (weakNearMiss && strongActionWords.length === 0) return false
  if (gameplayTerms.length > 0) return true
  return /(bang|clutch|double kill|flag secured|got the flag|grabbed the flag|got him|got me|gets me|headshot|killing frenzy|killing spree|sniper|stole the flag|taken out)/.test(text)
}

function isLowPayoffClipWindow(clipText, priorityProfile, detectionMode) {
  const text = String(clipText || '').toLowerCase().trim()
  if (!text) return true

  const transitionLike = /(last one before|before we head|head to the event|jump in(?:,|\s)gang|speaking of|look at me|let'?s do a|lets do a)/.test(text)
  const farewellLike = /(gg'?s?, guys|gg'?s everyone|good night|goodnight|see you tomorrow|thanks for watching|thanks for hanging|catch you next time)/.test(text)
  const aftermathLike = isCelebrationAftermathLike(text)
  const coordinationLike = /(i'll cover you|cover you|wait for me|come on|jump in|where are you|let'?s go to|lets go to)/.test(text)
  const workflowChatterLike = /(buttons in discord|export the x post|quest descriptions|raid descriptions|twitter post|trained with the|generations for the art)/.test(text)
  const fishingChatterLike = /\b(dark fish|first fish|fishing|caught a fish|caught fish|fish off)\b/.test(text)
  const passiveKillFeedLike = /\b(?:he|she|they|[a-z0-9_]{3,}) got killed by\b/.test(text)
  const concreteSignals = getConcreteActionMatches(text, priorityProfile)
  const payoffTerms = [...new Set([
    ...concreteSignals.actionTerms,
    ...concreteSignals.objectiveTerms,
    ...concreteSignals.actionShotTerms,
    ...uniqueMatches(text, GENRE_SIGNAL_PACKS.general_gaming.reaction),
    ...uniqueMatches(text, GENRE_SIGNAL_PACKS.general_gaming.funny),
  ])]

  if ((transitionLike || farewellLike) && concreteSignals.actionTerms.length === 0 && concreteSignals.objectiveTerms.length === 0 && concreteSignals.actionShotTerms.length === 0 && payoffTerms.length === 0) {
    return true
  }

  if (hasExplicitActionPriority(priorityProfile) && (workflowChatterLike || fishingChatterLike) && concreteSignals.directActionTerms.length === 0) {
    return true
  }

  if (aftermathLike && concreteSignals.actionTerms.length === 0 && concreteSignals.actionShotTerms.length === 0 && concreteSignals.objectiveTerms.length <= 1) {
    return true
  }

  if (passiveKillFeedLike && concreteSignals.actionShotTerms.length === 0 && concreteSignals.objectiveTerms.length === 0 && payoffTerms.length <= 1) {
    return true
  }

  if (coordinationLike && payoffTerms.length === 0 && detectionMode !== 'conversation') {
    return true
  }

  return false
}

function shouldDropExplicitActionClip(clip, priorityProfile) {
  if (!hasExplicitActionPriority(priorityProfile)) return false

  const text = String((clip?.subtitles || []).map((word) => word?.text || '').join(' ')).toLowerCase()
  if (!text) return false

  if (/\bgot him trained\b/.test(text)) return true
  if (/\bgot one\s+(?:dark\s+fish|fish)\b/.test(text)) return true
  if (/(buttons in discord|export the x post|quest descriptions|raid descriptions|twitter post|trained with the|generations for the art|dark fish|first fish|fishing|caught a fish|caught fish|fish off)/.test(text)) {
    return true
  }

  return false
}

function getCandidatePriorityRank(candidate, priorityProfile) {
  if (!candidate) return -Infinity

  const concreteSignals = getConcreteActionMatches(candidate.text, priorityProfile)
  const directActionCount = concreteSignals.actionTerms.length + concreteSignals.actionShotTerms.length
  const objectiveCount = concreteSignals.objectiveTerms.length
  const reactionCount = candidate.hits?.reaction?.length || 0
  const priorityCount = candidate.priorityMatches?.length || 0
  const exactPhraseCount = uniqueMatches(candidate.text, priorityProfile?.exactPhrases || []).length
  const aftermathPenalty = candidate.aftermathLike && directActionCount === 0 ? 8 : 0
  const reactionOnlyPenalty = reactionCount > 0 && directActionCount === 0 && objectiveCount === 0 ? 4 : 0

  return (candidate.score || 0)
    + directActionCount * 6
    + objectiveCount * 3
    + exactPhraseCount * 8
    + priorityCount * 2
    + (candidate.spikeHits || 0) * 1.5
    - aftermathPenalty
    - reactionOnlyPenalty
}

function getGameplayLeadInSec(text, priorityProfile, detectionMode) {
  if (!isGameplayStrictMode(priorityProfile, detectionMode)) return 0

  const lowered = String(text || '').trim().toLowerCase()
  const reactiveStart = /^(oh|yo|bro|what|damn|wow|oh my god)/.test(lowered)
  const directActionLead = /(avenge me|bang|flag secured|flag captured|from far away|got him|got one|got taken out|killing frenzy|killing spree|one down|picked off|revenge|taken out|they got it)/.test(lowered)
  if (!reactiveStart && !directActionLead) return 0

  if (/(got taken out|killed me|got me|gets me|melts me|melted|they got it|avenge me)/.test(lowered)) return 6
  if (/(did we win|we won|we lost|won the round|lost the round)/.test(lowered)) return 10
  if (/(flag secured|headshot|double kill|killing frenzy|killing spree|one shot|sniper|flag|captured|defuse|clutched|clutch play|clutch round|got him|got one|picked off|from far away|bang|revenge)/.test(lowered)) return 6
  return 0
}

function normalizeCueToken(text) {
  return sanitizeTranscriptToken(String(text || '').toLowerCase()).replace(/[^a-z0-9']+/g, '')
}

function findPhraseStartSecInSubtitles(subtitles, phrase) {
  const phraseTokens = String(phrase || '')
    .split(/\s+/)
    .map(normalizeCueToken)
    .filter(Boolean)

  if (phraseTokens.length === 0) return null

  const tokens = (subtitles || [])
    .map((word) => ({
      start: Number(word?.start) || 0,
      token: normalizeCueToken(word?.text),
    }))
    .filter((word) => word.token)

  for (let index = 0; index <= tokens.length - phraseTokens.length; index += 1) {
    let matched = true
    for (let offset = 0; offset < phraseTokens.length; offset += 1) {
      if (tokens[index + offset].token !== phraseTokens[offset]) {
        matched = false
        break
      }
    }

    if (matched) {
      return tokens[index].start
    }
  }

  return null
}

function getPriorityCuePhrasesForWindow(clipText, priorityProfile) {
  const concreteSignals = getConcreteActionMatches(clipText, priorityProfile)
  return [...new Set([
    ...(priorityProfile?.exactPhrases || []),
    ...(priorityProfile?.matches?.action || []),
    ...concreteSignals.actionTerms,
    ...concreteSignals.objectiveTerms,
    ...concreteSignals.actionShotTerms,
  ])]
}

function findPriorityCueMatchInPayload(payload, priorityProfile) {
  const subtitles = payload?.clip?.subtitles || []
  if (subtitles.length === 0) return null

  const clipText = subtitles.map((word) => word?.text || '').join(' ')
  const cuePhrases = getPriorityCuePhrasesForWindow(clipText, priorityProfile)
  let bestMatch = null

  for (const phrase of cuePhrases) {
    const relativeStartSec = findPhraseStartSecInSubtitles(subtitles, phrase)
    if (relativeStartSec == null) continue

    const absoluteStartSec = payload.selectedWindow.startSec + relativeStartSec
    if (!bestMatch || absoluteStartSec < bestMatch.absoluteStartSec || (absoluteStartSec === bestMatch.absoluteStartSec && String(phrase).length > String(bestMatch.phrase).length)) {
      bestMatch = { phrase, relativeStartSec, absoluteStartSec }
    }
  }

  return bestMatch
}

function getPriorityCueTrimLeadSec(phrase) {
  const lowered = String(phrase || '').toLowerCase()
  // Medal/objective notifications are aftermath. Keep enough lead-in to show the actual fight,
  // not just the badge/audio callout appearing at the start of the clip.
  if (/(killing frenzy|killing spree|double kill|triple kill)/.test(lowered)) return 9
  if (/(flag secured|captured the flag|got our flag|got the flag)/.test(lowered)) return 7
  if (/(fought him off|fought them off|got him|got one|picked off|one down|revenge|bang|headshot)/.test(lowered)) return 6
  return 5
}

function buildPriorityAwareClipPayload(startSec, viralityScore, aiReason, words, clipLength, detectionMode, priorityProfile) {
  const initialLeadInSec = getGameplayLeadInSec(
    words
      .filter((word) => (word.start || 0) / 1000 >= Math.max(0, startSec - 2) && (word.end || 0) / 1000 <= startSec + Math.min(10, clipLength * 0.4))
      .map((word) => sanitizeTranscriptToken(word.text))
      .filter(Boolean)
      .join(' '),
    priorityProfile,
    detectionMode,
  )
  const initialStartSec = initialLeadInSec > 0 ? Math.max(0, startSec - initialLeadInSec) : startSec
  let payload = buildClipPayloadFromWindow(initialStartSec, viralityScore, aiReason, words, clipLength, detectionMode)
  if (!payload) return null

  const leadInSec = getGameplayLeadInSec(payload.selectedWindow.text, priorityProfile, detectionMode)
  if (leadInSec > 0) {
    const shifted = buildClipPayloadFromWindow(Math.max(0, startSec - leadInSec), viralityScore, aiReason, words, clipLength, detectionMode)
    if (shifted) payload = shifted
  }

  const cueMatch = findPriorityCueMatchInPayload(payload, priorityProfile)
  if (cueMatch) {
    const trimmedStartSec = Math.max(payload.selectedWindow.startSec, cueMatch.absoluteStartSec - getPriorityCueTrimLeadSec(cueMatch.phrase))
    const minTrimDeltaSec = 1.25
    const minRemainingDurationSec = Math.max(14, clipLength * 0.72)

    if (trimmedStartSec - payload.selectedWindow.startSec >= minTrimDeltaSec && payload.selectedWindow.endSec - trimmedStartSec >= minRemainingDurationSec) {
      const trimmed = buildClipPayloadFromRange(trimmedStartSec, payload.selectedWindow.endSec, viralityScore, aiReason, words, detectionMode)
      if (trimmed) payload = trimmed
    }
  }

  return payload
}

function isDirectActionCandidate(candidate) {
  return Boolean(
    (candidate?.actionShotMatches?.length || 0) > 0 ||
    (candidate?.hits?.hardAction?.length || 0) > 0 ||
    (candidate?.hits?.objective?.length || 0) > 0
  )
}

function pickCandidatePoolSize(videoDurationMin, clipCount, priorityProfile, detectionMode) {
  const gameplayStrict = isGameplayStrictMode(priorityProfile, detectionMode)
  const actionPriority = hasActionPriority(priorityProfile)
  return Math.max(80, Math.min(320, Math.max(clipCount * (gameplayStrict ? 18 : actionPriority ? 20 : 16), Math.round(videoDurationMin * (gameplayStrict ? 1.8 : actionPriority ? 1.7 : 1.55)))))
}

function buildCandidatePool(scoredCandidates, totalSec, targetCandidates, priorityProfile, detectionMode) {
  if (scoredCandidates.length <= targetCandidates) return scoredCandidates

  const gameplayStrict = isGameplayStrictMode(priorityProfile, detectionMode)
  const actionPriority = hasActionPriority(priorityProfile)
  const pool = []
  const buckets = Math.max(5, Math.min(10, Math.ceil(totalSec / 720)))
  const bucketDuration = Math.max(1, totalSec / buckets)
  const perBucket = Math.max(actionPriority ? 8 : 6, Math.ceil(targetCandidates / buckets))
  const seen = new Set()

  for (let bucketIndex = 0; bucketIndex < buckets; bucketIndex += 1) {
    const bucketStart = bucketIndex * bucketDuration
    const bucketEnd = bucketStart + bucketDuration
    const bucketCandidates = scoredCandidates
      .filter((candidate) => candidate.startSec >= bucketStart && candidate.startSec < bucketEnd)
      .filter((candidate) => {
        if (gameplayStrict) {
          return passesGameplayPriorityGate(candidate, priorityProfile, detectionMode) || candidate.score >= (actionPriority ? 8 : 18)
        }
        if (actionPriority) {
          return candidate.score >= 8 || candidate.signalDensity >= 2 || candidate.hasGameplayPayoff || candidate.priorityMatches?.length > 0 || candidate.spikeHits > 0
        }
        return candidate.score >= 3 || candidate.signalDensity >= 1 || candidate.hasGameplayPayoff || candidate.spikeHits > 0 || candidate.wholeTranscriptScout
      })
      .slice(0, perBucket)

    for (const candidate of bucketCandidates) {
      if (seen.has(candidate.startSec)) continue
      pool.push(candidate)
      seen.add(candidate.startSec)
    }
  }

  if (actionPriority) {
    const reservedActionCandidates = scoredCandidates
      .filter((candidate) => isDirectActionCandidate(candidate) || candidate.priorityMatches?.length > 0)
      .filter((candidate) => passesGameplayPriorityGate(candidate, priorityProfile, detectionMode) || candidate.score >= 8)
      .slice(0, Math.min(targetCandidates, Math.max(12, Math.ceil(targetCandidates * 0.35))))

    for (const candidate of reservedActionCandidates) {
      if (pool.length >= targetCandidates) break
      if (seen.has(candidate.startSec)) continue
      pool.push(candidate)
      seen.add(candidate.startSec)
    }
  }

  for (const candidate of scoredCandidates) {
    if (pool.length >= targetCandidates) break
    if (seen.has(candidate.startSec)) continue
    pool.push(candidate)
    seen.add(candidate.startSec)
  }

  return pool
}

function getCandidateBucketIndex(candidate, totalSec, bucketCount) {
  const safeTotal = Math.max(1, totalSec || 1)
  const safeBuckets = Math.max(1, bucketCount || 1)
  return Math.max(0, Math.min(safeBuckets - 1, Math.floor(((candidate?.startSec || 0) / safeTotal) * safeBuckets)))
}

function selectPromptCandidatesWithCoverage(topCandidates, totalSec, limit, priorityProfile, detectionMode) {
  if (!Array.isArray(topCandidates) || topCandidates.length <= limit) return topCandidates

  const bucketCount = Math.max(6, Math.min(12, Math.ceil((totalSec || 0) / 600)))
  const minPerBucket = isGameplayStrictMode(priorityProfile, detectionMode) ? 2 : 3
  const selected = []
  const seen = new Set()

  const addCandidate = (candidate) => {
    if (!candidate || seen.has(candidate.startSec) || selected.length >= limit) return false
    selected.push(candidate)
    seen.add(candidate.startSec)
    return true
  }

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const bucketCandidates = topCandidates
      .filter((candidate) => getCandidateBucketIndex(candidate, totalSec, bucketCount) === bucket)
      .sort((a, b) => getCandidatePriorityRank(b, priorityProfile) - getCandidatePriorityRank(a, priorityProfile))

    let added = 0
    for (const candidate of bucketCandidates) {
      if (added >= minPerBucket) break
      if (addCandidate(candidate)) added += 1
    }
  }

  for (const candidate of topCandidates) {
    if (selected.length >= limit) break
    addCandidate(candidate)
  }

  return selected.sort((a, b) => {
    const rankDelta = getCandidatePriorityRank(b, priorityProfile) - getCandidatePriorityRank(a, priorityProfile)
    if (rankDelta !== 0) return rankDelta
    return a.startSec - b.startSec
  })
}

function sortCandidatesForCoverageBackfill(candidates, selectedClips, totalSec, priorityProfile) {
  const bucketCount = Math.max(6, Math.min(12, Math.ceil((totalSec || 0) / 600)))
  const usedBuckets = new Set((selectedClips || []).map((clip) => getCandidateBucketIndex(clip, totalSec, bucketCount)))

  return [...(candidates || [])].sort((a, b) => {
    const aBucketUsed = usedBuckets.has(getCandidateBucketIndex(a, totalSec, bucketCount)) ? 1 : 0
    const bBucketUsed = usedBuckets.has(getCandidateBucketIndex(b, totalSec, bucketCount)) ? 1 : 0
    if (aBucketUsed !== bBucketUsed) return aBucketUsed - bBucketUsed

    const rankDelta = getCandidatePriorityRank(b, priorityProfile) - getCandidatePriorityRank(a, priorityProfile)
    if (rankDelta !== 0) return rankDelta
    return a.startSec - b.startSec
  })
}

function mergeChunkSources(primaryChunks, secondaryChunks) {
  const merged = []
  const seen = new Set()

  for (const chunk of [...(primaryChunks || []), ...(secondaryChunks || [])]) {
    const startBucket = Math.round((chunk.startSec || 0) * 2) / 2
    const endBucket = Math.round((chunk.endSec || 0) * 2) / 2
    const key = `${startBucket}-${endBucket}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(chunk)
  }

  return merged
}

function buildActionCueChunks(words, introSkipSec, totalSec, priorityProfile) {
  if (!hasActionPriority(priorityProfile)) return []

  const cues = []

  for (let index = 0; index < words.length; index += 1) {
    const currentWord = words[index]
    if (!currentWord) continue

    const centerSec = (currentWord.start || 0) / 1000
    if (centerSec < introSkipSec || centerSec > totalSec) continue

    const startIndex = Math.max(0, index - 10)
    const endIndex = Math.min(words.length, index + 18)
    const scopedWords = words.slice(startIndex, endIndex)
    const scopedText = scopedWords.map((word) => sanitizeTranscriptToken(word.text)).filter(Boolean).join(' ')
    if (!scopedText) continue

    const directMatches = getActionShotMatches(scopedText)
    const priorityMatches = getPriorityMatches(scopedText, priorityProfile)
    const concreteSignals = getConcreteActionMatches(scopedText, priorityProfile)
    if (directMatches.length === 0 && priorityMatches.length === 0 && concreteSignals.directActionTerms.length === 0) {
      continue
    }

    const cueStart = Math.max(introSkipSec, centerSec - 5)
    const cueEnd = Math.min(totalSec, centerSec + 7)
    const cueText = words
      .filter((word) => (word.start || 0) / 1000 >= cueStart && (word.end || 0) / 1000 <= cueEnd)
      .map((word) => sanitizeTranscriptToken(word.text))
      .filter(Boolean)
      .join(' ')

    if (!cueText) continue

    cues.push({
      startSec: cueStart,
      endSec: cueEnd,
      durationSec: Math.max(4, cueEnd - cueStart),
      words: cueText.split(/\s+/),
      text: cueText,
    })
  }

  return mergeChunkSources(cues, [])
}

function buildClipReasonFromWindow(clipText, detectionMode) {
  const text = String(clipText || '').trim()
  if (!text) return 'Strong moment from the stream'

  const lowered = text.toLowerCase()
  if (/(clutch|ace|wiped|wipe|headshot|double kill|killing frenzy|killing spree|triple kill|one shot)/.test(lowered)) return 'Gameplay payoff with a strong reaction'
  if (/(caps? the flag|got our flag|got the flag|flag secured|captured the flag|stole the flag)/.test(lowered)) return 'Objective swing with a live reaction'
  if (/(won|victory|raid complete|wave cleared|goal|champion)/.test(lowered)) return 'A clean win or objective swing'
  if (/(bruh|lmao|haha|wtf|no way)/.test(lowered) || detectionMode === 'funny') return 'Funny reaction with a clear payoff'
  return 'Memorable moment with a clear reaction'
}

function mapCandidateScoreToVirality(score) {
  if (score >= 75) return 8
  if (score >= 55) return 7
  if (score >= 36) return 6
  return 5
}

function shellQuote(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function clampProofFrameTimestamp(startSec, endSec, ratio) {
  const duration = Math.max(1, endSec - startSec)
  return parseFloat(Math.max(0, startSec + (duration * ratio)).toFixed(2))
}

function buildProofFramesForClip(startSec, endSec, viralityScore, aiReason, clipText, detectionMode) {
  const duration = Math.max(1, endSec - startSec)
  const scoreBase = Math.max(5, Math.min(10, Number(viralityScore) || 7))
  const lowered = `${aiReason || ''} ${clipText || ''}`.toLowerCase()
  const hasActionCue = /(clutch|kill|headshot|wipe|won|victory|goal|flag|raid|no way|wtf|haha|lmao|bruh)/.test(lowered)
  const cleanRatio = duration <= 16 ? 0.28 : 0.2
  // Bias stills toward the action build/payoff, not the post-action menu/scoreboard aftermath.
  const bestRatio = hasActionCue || detectionMode === 'gaming' ? 0.46 : 0.44
  const actionRatio = hasActionCue || detectionMode === 'gaming' ? 0.56 : 0.54

  return [
    {
      label: 'best',
      timestamp: clampProofFrameTimestamp(startSec, endSec, bestRatio),
      score: Math.min(10, scoreBase + 1),
      reason: hasActionCue ? 'Best payoff frame near the scored moment.' : 'Best representative frame from the selected clip.',
    },
    {
      label: 'action',
      timestamp: clampProofFrameTimestamp(startSec, endSec, actionRatio),
      score: Math.min(10, scoreBase),
      reason: 'Alternate action/reaction frame for social options.',
    },
    {
      label: 'clean',
      timestamp: clampProofFrameTimestamp(startSec, endSec, cleanRatio),
      score: Math.max(5, scoreBase - 1),
      reason: 'Cleaner thumbnail candidate before the peak moment.',
    },
  ]
}

function parseSignalStats(output) {
  const metrics = {}
  for (const match of String(output || '').matchAll(/lavfi\.signalstats\.([A-Z]+)=(-?\d+(?:\.\d+)?)/g)) {
    metrics[match[1]] = Number(match[2])
  }
  return metrics
}

function parseAverageSignalMetric(output, key) {
  const values = [...String(output || '').matchAll(new RegExp(`lavfi\\.signalstats\\.${key}=(-?\\d+(?:\\.\\d+)?)`, 'g'))]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value))
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function analyzeFrameMotion(inputPath, timestamp) {
  try {
    const start = Math.max(0, Number(timestamp || 0) - 0.45)
    const result = spawnSync('ffmpeg', [
      '-hide_banner',
      '-ss', String(start),
      '-i', inputPath,
      '-t', '0.9',
      '-an',
      '-vf', 'fps=6,scale=160:-1,format=gray,tblend=all_mode=difference,signalstats,metadata=print',
      '-f', 'null',
      '-',
    ], { encoding: 'utf8', timeout: 12000, maxBuffer: 1024 * 1024 })
    const output = `${result.stdout || ''}\n${result.stderr || ''}`
    const motionYAvg = parseAverageSignalMetric(output, 'YAVG')
    if (motionYAvg == null) return { score: 0, reason: 'Motion metrics unavailable.' }
    return {
      score: motionYAvg,
      reason: motionYAvg < 1.1
        ? 'Very low local motion; likely menu/static overlay.'
        : motionYAvg < 2.2
          ? 'Low local motion.'
          : 'Local motion looks like gameplay.',
    }
  } catch (error) {
    return { score: 0, reason: `Motion scoring skipped: ${error.message}` }
  }
}

function visualRejectReason(metrics, timestamp, totalSec, motion) {
  const yAvg = metrics.YAVG ?? 0
  const yMin = metrics.YMIN ?? 0
  const yMax = metrics.YMAX ?? 0
  const satAvg = metrics.SATAVG ?? 0
  const contrast = yMax - yMin

  if (timestamp < 8) return 'opening seconds'
  if (totalSec && timestamp > totalSec - 8) return 'closing seconds'
  if (yAvg < 14 || (yAvg < 24 && contrast < 38)) return 'black/dark frame'
  if (yAvg > 238 && satAvg < 10) return 'white/blank frame'
  if (contrast < 24) return 'solid/low-detail frame'
  if (satAvg < 3 && contrast < 45) return 'flat grayscale frame'
  if (motion && motion.score > 0 && motion.score < 1.1 && contrast > 55) return 'static/menu-like frame'
  return null
}

function scoreVisualMetrics(metrics, timestamp, totalSec, motion) {
  const yAvg = metrics.YAVG ?? 0
  const yMin = metrics.YMIN ?? 0
  const yMax = metrics.YMAX ?? 0
  const satAvg = metrics.SATAVG ?? 0
  const contrast = yMax - yMin
  const brightnessScore = yAvg >= 45 && yAvg <= 205 ? 2 : yAvg >= 28 && yAvg <= 225 ? 1 : -3
  const contrastScore = contrast >= 115 ? 3 : contrast >= 70 ? 2 : contrast >= 42 ? 1 : -3
  const saturationScore = satAvg >= 18 ? 2 : satAvg >= 8 ? 1 : satAvg < 3 ? -2 : 0
  const edgePenalty = (timestamp < 15 || (totalSec && timestamp > totalSec - 15)) ? -4 : 0
  const motionScore = motion?.score > 4 ? 2 : motion?.score > 2.2 ? 1 : motion?.score > 0 && motion.score < 1.1 ? -5 : 0
  return brightnessScore + contrastScore + saturationScore + edgePenalty + motionScore
}

function analyzeProofFrameVisual(sourceUrl, timestamp, totalSec) {
  const inputPath = resolveServedInputPath(sourceUrl)
  if (!inputPath) return { usable: true, score: 0, reason: 'No source available for visual scoring.' }

  try {
    const result = spawnSync('ffmpeg', [
      '-hide_banner',
      '-ss', String(Math.max(0, timestamp)),
      '-i', inputPath,
      '-an',
      '-frames:v', '1',
      '-vf', 'scale=160:-1,signalstats,metadata=print',
      '-f', 'null',
      '-',
    ], { encoding: 'utf8', timeout: 12000, maxBuffer: 1024 * 1024 })
    const output = `${result.stdout || ''}\n${result.stderr || ''}`
    const metrics = parseSignalStats(output)
    if (!Object.keys(metrics).length) return { usable: true, score: 0, reason: 'Visual metrics unavailable.' }
    const motion = analyzeFrameMotion(inputPath, timestamp)
    const reject = visualRejectReason(metrics, timestamp, totalSec, motion)
    const visualScore = scoreVisualMetrics(metrics, timestamp, totalSec, motion)
    return {
      usable: !reject,
      score: visualScore,
      reason: reject ? `Rejected: ${reject}. ${motion.reason}` : `Visual pass: brightness/contrast/detail usable. ${motion.reason}`,
      metrics,
      motion,
    }
  } catch (error) {
    return { usable: true, score: 0, reason: `Visual scoring skipped: ${error.message}` }
  }
}

function candidateProofFrameTimestamps(clip) {
  const start = Math.max(0, Number(clip.start_time) || 0)
  const end = Math.max(start + 1, Number(clip.end_time) || start + 1)
  const duration = end - start
  // Prefer early/mid action frames. Late clip frames are where menus, scoreboards,
  // death screens, and inventory overlays most often appear.
  const ratios = [0.1, 0.18, 0.26, 0.34, 0.42, 0.5, 0.58, 0.66]
  const seeded = Array.isArray(clip.proof_frames) ? clip.proof_frames.map((frame) => Number(frame.timestamp)) : []
  const cueWords = Array.isArray(clip.subtitles)
    ? clip.subtitles
        .filter((word) => /\b(bang|clutch|flag|got|headshot|kill|killing|lmao|no|revenge|sniper|wipe|won|wtf)\b/i.test(word?.text || ''))
        .slice(0, 8)
        .map((word) => start + Number(word.start || 0) + 0.35)
    : []

  return [...new Set([...seeded, ...cueWords, ...ratios.map((ratio) => start + duration * ratio)]
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(start, Math.min(end - 0.25, value)).toFixed(2)))]
    .map(Number)
}

async function enrichClipsWithVisualProofFrames(clips, sourceUrl, totalSec) {
  if (!sourceUrl || !clips?.length) return clips

  return clips.map((clip) => {
    const baseScore = Number(clip.virality_score || 7)
    const candidates = candidateProofFrameTimestamps(clip).map((timestamp) => {
      const visual = analyzeProofFrameVisual(sourceUrl, timestamp, totalSec)
      const peakBias = 2 - Math.abs(timestamp - (clip.start_time + ((clip.end_time - clip.start_time) * 0.58))) / Math.max(4, clip.duration || 30)
      return {
        timestamp,
        visual,
        score: baseScore + visual.score + peakBias,
      }
    })

    const usable = candidates.filter((candidate) => candidate.visual.usable)
    const ranked = (usable.length ? usable : candidates)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    const labels = ['best', 'action', 'clean']
    return {
      ...clip,
      proof_frames: ranked.map((candidate, index) => ({
        label: labels[index],
        timestamp: parseFloat(candidate.timestamp.toFixed(2)),
        score: Math.max(1, Math.min(10, Math.round(candidate.score))),
        reason: `${candidate.visual.reason}${usable.length ? '' : ' Fallback used because all sampled frames looked weak.'}`,
      })),
    }
  })
}

function buildClipPayloadFromRange(startSec, endSec, viralityScore, aiReason, words, detectionMode) {
  const safeStartSec = Math.max(0, Number(startSec) || 0)
  const safeEndSec = Math.max(safeStartSec + 1, Number(endSec) || safeStartSec + 1)
  const clipStartMs = safeStartSec * 1000
  const clipEndMs = safeEndSec * 1000
  const subtitles = words
    .filter(w => w.start >= clipStartMs - 500 && w.end <= clipEndMs + 500)
    .map(w => ({
      text: w.text,
      start: parseFloat(Math.max(0, (w.start - clipStartMs) / 1000).toFixed(2)),
      end: parseFloat(((w.end - clipStartMs) / 1000).toFixed(2)),
    }))
    .sort((a, b) => (a.start - b.start) || (a.end - b.end))

  const clipText = subtitles.map((word) => word.text).join(' ').trim()
  if (!clipText) return null

  return {
    selectedWindow: {
      startSec: safeStartSec,
      endSec: safeEndSec,
      text: clipText,
    },
    clip: {
      start_time: safeStartSec,
      end_time: safeEndSec,
      duration: parseFloat((safeEndSec - safeStartSec).toFixed(2)),
      virality_score: viralityScore,
      ai_reason: (aiReason || buildClipReasonFromWindow(clipText, detectionMode)).slice(0, 120),
      matched_categories: [],
      proof_frames: buildProofFramesForClip(safeStartSec, safeEndSec, viralityScore, aiReason, clipText, detectionMode),
      subtitles,
    },
  }
}

function buildClipPayloadFromWindow(startSec, viralityScore, aiReason, words, clipLength, detectionMode) {
  return buildClipPayloadFromRange(startSec, startSec + clipLength, viralityScore, aiReason, words, detectionMode)
}

function formatCandidateLine(candidate) {
  const tags = [
    candidate.hits.hardAction.length ? `A${candidate.hits.hardAction.length}` : '',
    candidate.hits.objective.length ? `O${candidate.hits.objective.length}` : '',
    candidate.hits.reaction.length ? `R${candidate.hits.reaction.length}` : '',
    candidate.hits.funny.length ? `F${candidate.hits.funny.length}` : '',
    candidate.priorityMatches?.length ? `P${candidate.priorityMatches.length}` : '',
    candidate.hits.negative.length ? `N${candidate.hits.negative.length}` : '',
    candidate.spikeHits ? `S${candidate.spikeHits}` : '',
    candidate.audioAction ? `GUN${Math.round(candidate.audioActionScore || 1)}` : '',
  ].filter(Boolean).join(' ')

  const priorityCue = candidate.priorityMatches?.length
    ? ` priority=${candidate.priorityMatches.join(', ')}`
    : ''
  const scoutCue = candidate.wholeTranscriptScout
    ? ` scout=${String(candidate.scoutReason || 'whole transcript').slice(0, 90)}`
    : ''

  return `[${formatClock(candidate.startSec)}-${formatClock(candidate.endSec)}] pre=${candidate.score.toFixed(1)}${tags ? ` ${tags}` : ''}${priorityCue}${scoutCue} :: ${candidate.text.slice(0, 220)}`
}


function buildWholeTranscriptForScout(segments, maxChars = 120000) {
  const lines = (segments || []).map((segment) => `[${formatClock(segment.startSec)}] ${segment.text}`)
  const joined = lines.join('\n')
  if (joined.length <= maxChars) return joined

  const keep = []
  let used = 0
  const step = Math.max(1, Math.ceil(lines.length / 650))
  for (let i = 0; i < lines.length; i += step) {
    const line = lines[i]
    if (used + line.length + 1 > maxChars) break
    keep.push(line)
    used += line.length + 1
  }
  return keep.join('\n')
}

function buildScoutChunksFromMoments(moments, words, introSkipSec, totalSec, clipLength) {
  const chunks = []
  const seen = new Set()

  for (const moment of moments || []) {
    const rawStart = Number(moment?.s ?? moment?.start ?? moment?.startSec ?? moment?.timestamp)
    if (!Number.isFinite(rawStart)) continue
    const centerSec = Math.max(introSkipSec, Math.min(totalSec, rawStart))
    const bucket = Math.round(centerSec / 5) * 5
    if (seen.has(bucket)) continue
    seen.add(bucket)

    const windowStart = Math.max(introSkipSec, centerSec - Math.min(8, Math.max(4, clipLength * 0.25)))
    const windowEnd = Math.min(totalSec, centerSec + Math.min(16, Math.max(8, clipLength * 0.55)))
    const scopedWords = words
      .filter((word) => (word.start || 0) / 1000 >= windowStart && (word.end || 0) / 1000 <= windowEnd)
      .map((word) => sanitizeTranscriptToken(word.text))
      .filter(Boolean)

    if (scopedWords.length < 3) continue
    chunks.push({
      startSec: windowStart,
      endSec: windowEnd,
      durationSec: Math.max(4, windowEnd - windowStart),
      words: scopedWords,
      text: scopedWords.join(' '),
      scoutReason: String(moment?.r || moment?.reason || moment?.why || 'whole-transcript scout pick').slice(0, 140),
      scoutScore: Number(moment?.v ?? moment?.score ?? 7) || 7,
    })
  }

  return chunks
}

function buildAudioActionChunks(volumeSpikes, words, introSkipSec, totalSec, clipLength) {
  const chunks = []
  const seen = new Set()

  for (const spike of (volumeSpikes || [])) {
    const spikeStart = Number(spike.startSec)
    if (!Number.isFinite(spikeStart) || spikeStart < introSkipSec || spikeStart > totalSec) continue
    const centerSec = Math.max(introSkipSec, Math.min(totalSec, (spike.startSec + (spike.endSec || spike.startSec)) / 2))
    const bucket = Math.round(centerSec / 6) * 6
    if (seen.has(bucket)) continue
    seen.add(bucket)

    const windowStart = Math.max(introSkipSec, centerSec - Math.max(8, clipLength * 0.35))
    const windowEnd = Math.min(totalSec, centerSec + Math.max(12, clipLength * 0.55))
    const scopedWords = words
      .filter((word) => (word.start || 0) / 1000 >= windowStart && (word.end || 0) / 1000 <= windowEnd)
      .map((word) => sanitizeTranscriptToken(word.text))
      .filter(Boolean)

    if (scopedWords.length < 2) continue
    chunks.push({
      startSec: windowStart,
      endSec: windowEnd,
      durationSec: Math.max(4, windowEnd - windowStart),
      words: scopedWords,
      text: scopedWords.join(' '),
      audioAction: true,
      audioActionScore: spike.actionScore || spike.spikeLevel || spike.spikeCount || 1,
    })
  }

  return chunks
}


async function callGeminiText(apiKey, model, prompt, options = {}) {
  const { temperature = 0.2, maxOutputTokens = 2048, retries = 4, timeoutMs = 90000 } = options

  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        }),
      })
    } catch (error) {
      clearTimeout(timer)
      lastError = error
      if (attempt === retries) break
      const backoffMs = Math.min(15000, 1000 * Math.pow(2, attempt - 1))
      console.warn(`[gemini] ${model} attempt ${attempt}/${retries} failed: ${error.message}. Retrying in ${backoffMs}ms`)
      await sleep(backoffMs)
      continue
    } finally {
      clearTimeout(timer)
    }

    if (response.ok) {
      const geminiData = await response.json()
      return geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    }

    const errorText = await response.text()
    lastError = new Error(`Gemini failed: ${response.status} ${errorText}`)
    const retryable = response.status === 429 || response.status >= 500

    if (!retryable || attempt === retries) {
      break
    }

    const backoffMs = Math.min(15000, 1000 * Math.pow(2, attempt - 1))
    console.warn(`[gemini] ${model} attempt ${attempt}/${retries} failed with ${response.status}. Retrying in ${backoffMs}ms`)
    await sleep(backoffMs)
  }

  throw lastError || new Error('Gemini failed with unknown error')
}


async function callOpenRouterText(apiKey, model, prompt, options = {}) {
  const { temperature = 0.2, maxOutputTokens = 4096, retries = 2, timeoutMs = 45000 } = options
  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://deputy-stats-implies-beaches.trycloudflare.com',
          'X-Title': 'Slicer',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
      })
    } catch (error) {
      clearTimeout(timer)
      lastError = error?.name === 'AbortError'
        ? new Error(`OpenRouter timed out after ${timeoutMs}ms`)
        : error
      if (attempt === retries) break
      const backoffMs = Math.min(15000, 1000 * Math.pow(2, attempt - 1))
      console.warn(`[openrouter] ${model} attempt ${attempt}/${retries} failed: ${lastError.message}. Retrying in ${backoffMs}ms`)
      await sleep(backoffMs)
      continue
    } finally {
      clearTimeout(timer)
    }

    if (response.ok) {
      const data = await response.json()
      return data.choices?.[0]?.message?.content ?? ''
    }

    const errorText = await response.text()
    lastError = new Error(`OpenRouter failed: ${response.status} ${errorText}`)
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt === retries) break

    const backoffMs = Math.min(15000, 1000 * Math.pow(2, attempt - 1))
    console.warn(`[openrouter] ${model} attempt ${attempt}/${retries} failed with ${response.status}. Retrying in ${backoffMs}ms`)
    await sleep(backoffMs)
  }

  throw lastError || new Error('OpenRouter failed with unknown error')
}

function extractJsonObject(text) {
  const stripped = String(text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  return stripped.match(/\{[\s\S]*\}/)?.[0] ?? null
}

function buildTokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  )
}

function jaccardSimilarity(textA, textB) {
  const a = buildTokenSet(textA)
  const b = buildTokenSet(textB)
  if (a.size === 0 || b.size === 0) return 0

  let intersection = 0
  for (const token of a) {
    if (b.has(token)) intersection += 1
  }

  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function shouldSkipDuplicateClip(selectedClips, candidateStartSec, candidateEndSec, candidateText, clipLength) {
  return selectedClips.some((existing) => {
    const overlapSec = Math.max(0, Math.min(existing.endSec, candidateEndSec) - Math.max(existing.startSec, candidateStartSec))
    const overlapRatio = overlapSec / Math.max(clipLength, 1)
    const similarity = jaccardSimilarity(existing.text, candidateText)
    const startDelta = Math.abs(existing.startSec - candidateStartSec)

    if (startDelta <= 6) return true
    if (startDelta <= 18 && overlapRatio >= 0.32) return true
    if (overlapRatio >= 0.72) return true
    if (startDelta <= 16 && similarity >= 0.45) return true
    if (startDelta <= 28 && similarity >= 0.58) return true
    return overlapRatio >= 0.4 && similarity >= 0.55
  })
}

function clipWindowMatchesPriorityCue(text, priorityProfile) {
  if (!priorityProfile?.raw) return false

  return uniqueMatches(text, [
    ...(priorityProfile.exactPhrases || []),
    ...(priorityProfile.matches?.action || []),
  ]).length > 0
}

function shouldSkipPriorityAdjacentSetup(selectedClips, candidateWindow, priorityProfile) {
  if (!hasActionPriority(priorityProfile)) return false
  if (!candidateWindow?.text) return false
  if (clipWindowMatchesPriorityCue(candidateWindow.text, priorityProfile)) return false

  return selectedClips.some((existing) => {
    if (!clipWindowMatchesPriorityCue(existing?.text, priorityProfile)) return false

    const overlapSec = Math.max(0, Math.min(existing.endSec, candidateWindow.endSec) - Math.max(existing.startSec, candidateWindow.startSec))
    const startDelta = Math.abs(existing.startSec - candidateWindow.startSec)
    return overlapSec >= 4 || startDelta <= 30
  })
}

function normalizeModelClipStartSec(value, topCandidates, introSkipSec, totalSec) {
  const raw = Math.max(0, Math.round(Number(value) || 0))
  if (!raw) return 0

  if (raw < introSkipSec && Array.isArray(topCandidates) && raw <= topCandidates.length) {
    const indexedCandidate = topCandidates[Math.max(0, raw - 1)]
    if (indexedCandidate?.startSec >= introSkipSec) {
      return Math.max(0, Math.round(indexedCandidate.startSec))
    }
  }

  return Math.min(raw, Math.max(0, Math.round(totalSec - 1)))
}

// ─── Local Whisper transcription endpoint ───
async function handleTranscribeLocal(req, res) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  let parsed
  try { parsed = JSON.parse(raw) } catch { return sendJson(res, 400, { error: 'Invalid JSON' }) }

  const { audioUrl, audioPath, jobId: requestJobId } = parsed
  if (!audioUrl && !audioPath) return sendJson(res, 400, { error: 'audioUrl or audioPath required' })

  // Check transcription cache first
  const cacheSource = audioUrl || audioPath
  const cached = getCachedTranscription(cacheSource)
  if (cached) {
    const transcribeId = crypto.randomBytes(8).toString('hex')
    const filePath = resolveServedFilePath(audioUrl, audioPath)
    const volumeSpikes = detectVolumeSpikesForFile(filePath).slice(0, 80)
    const cacheKey = getTranscriptionCacheKey(cacheSource)
    setTranscription(transcribeId, { status: 'complete', result: cached, volumeSpikes, cached: true, cacheKey })
    console.log(`[transcribe-local] Cache hit! ${cached.words?.length} words. Skipping Groq, using cached result directly.`)

    sendJson(res, 200, { transcribeId, cached: true })

    if (requestJobId) {
      setImmediate(async () => {
        try {
          await mergeJobProgress(requestJobId, {
            phase: 'transcribing',
            progress: 'Transcript cache hit, preparing scoring...',
            transcriptionCached: true,
            transcriptionCacheKey: cacheKey,
            transcriptWordCount: cached.words?.length || 0,
            volumeSpikeCount: volumeSpikes.length,
            sourceReady: true,
          })
          console.log(`[transcribe-local] Cache summary pushed to job ${requestJobId}`)
        } catch (err) {
          console.error('[transcribe-local] Cache push failed:', err.message)
        }
      })
    }

    return
  }

  const transcribeId = crypto.randomBytes(8).toString('hex')
  setTranscription(transcribeId, { status: 'transcribing', progress: 'Starting Whisper...' })

  console.log(`[transcribe-local] ${transcribeId} starting`)

  // Run in background
  ;(async () => {
    try {
      // Resolve audio file path
      let filePath = resolveServedFilePath(audioUrl, audioPath)
      if (!filePath && audioUrl) {
        if (audioUrl.includes('/serve/')) {
          const fileName = audioUrl.split('/serve/').pop()
          filePath = path.join(TEMP_DIR, decodeURIComponent(fileName))
        } else {
          // Download the file first
          const fileId = crypto.randomBytes(8).toString('hex')
          filePath = path.join(TEMP_DIR, `${fileId}-audio.mp4`)
          const dlCmd = `yt-dlp -f "ba/b" -o "${filePath}" "${audioUrl}"`
          execSync(dlCmd, { timeout: 30 * 60 * 1000 })
        }
      }

      if (!filePath || !fs.existsSync(filePath)) {
        setTranscription(transcribeId, { status: 'error', error: 'Audio file not found' })
        return
      }

      setTranscription(transcribeId, { status: 'transcribing', progress: 'Running Whisper medium model...' })

      const whisperScript = path.join(__dirname, 'whisper-transcribe.py')
      const groqKey = process.env.GROQ_API_KEY || ''
      const whisperArgs = [whisperScript, filePath, '--groq-key', groqKey]

      console.log(`[transcribe-local] ${transcribeId} running: python ${whisperArgs.map((value) => JSON.stringify(value)).join(' ')}`)

      const whisperProc = spawn('python', whisperArgs, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderrTail = ''
      const appendTail = (current, chunk, maxChars = 4000) => {
        const next = current + chunk
        return next.length > maxChars ? next.slice(-maxChars) : next
      }

      whisperProc.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })

      whisperProc.stderr.on('data', (chunk) => {
        stderrTail = appendTail(stderrTail, chunk.toString())
      })

      whisperProc.on('error', (err) => {
        console.error(`[transcribe-local] ${transcribeId} error:`, err.message)
        setTranscription(transcribeId, { status: 'error', error: `Whisper failed: ${err.message}` })
      })

      whisperProc.on('close', (code) => {
        if (stderrTail.trim()) console.log(`[transcribe-local] ${transcribeId} stderr:`, stderrTail.trim().slice(-500))

        if (code !== 0) {
          const detail = stderrTail.trim().split('\n').pop() || `exit code ${code}`
          console.error(`[transcribe-local] ${transcribeId} error:`, detail)
          setTranscription(transcribeId, { status: 'error', error: `Whisper failed: ${detail}` })
          return
        }

        try {
          const result = JSON.parse(stdout.trim().split('\n').pop())
          if (result.error) throw new Error(result.error)
          console.log(`[transcribe-local] ${transcribeId} complete: ${result.words?.length} words, ${result.duration}s, ${result.realtime_factor}x realtime`)
          
          const cacheKey = audioUrl || audioPath
          if (cacheKey) setCachedTranscription(cacheKey, result)

          let volumeSpikes = []
          try {
            console.log(`[transcribe-local] ${transcribeId} analyzing audio energy...`)
            const audioFileForAnalysis = result.wav_path && fs.existsSync(result.wav_path)
              ? result.wav_path
              : filePath
            if (audioFileForAnalysis !== filePath) {
              console.log(`[transcribe-local] ${transcribeId} using pre-extracted WAV for audio analysis (fast path)`)
            }
            volumeSpikes = detectVolumeSpikesForFile(audioFileForAnalysis).slice(0, 80)
            console.log(`[transcribe-local] ${transcribeId} found ${volumeSpikes.length} volume spikes`)
          } catch (e) {
            console.error(`[transcribe-local] Audio energy analysis failed:`, e.message)
          }

          setTranscription(transcribeId, {
            status: 'complete',
            result,
            volumeSpikes,
            cached: false,
            cacheKey: cacheKey ? getTranscriptionCacheKey(cacheKey) : undefined,
          })

          if (requestJobId) {
            mergeJobProgress(requestJobId, {
              phase: 'transcribing',
              progress: 'Transcription complete, preparing scoring...',
              transcriptionCached: false,
              transcriptionCacheKey: cacheKey ? getTranscriptionCacheKey(cacheKey) : undefined,
              transcriptWordCount: result.words?.length || 0,
              volumeSpikeCount: volumeSpikes.length,
              sourceReady: true,
            }).then(() => {
              console.log(`[transcribe-local] ${transcribeId} pushed summary to job ${requestJobId}`)
            }).catch(err => {
              console.error(`[transcribe-local] Job store push failed:`, err.message)
            })
          }
        } catch (parseErr) {
          setTranscription(transcribeId, { status: 'error', error: `Parse error: ${parseErr.message}` })
        }
      })
    } catch (err) {
      console.error(`[transcribe-local] ${transcribeId} error:`, err.message)
      setTranscription(transcribeId, { status: 'error', error: err.message })
    }
  })()

  sendJson(res, 200, { transcribeId })
}

// Track in-progress scoring jobs to prevent duplicate calls
const scoringInProgress = new Set()

// ─── Gemini clip scoring endpoint (runs locally, no Vercel timeout) ───
async function handleScoreClips(req, res) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  let parsed
  try { parsed = JSON.parse(raw) } catch { return sendJson(res, 400, { error: 'Invalid JSON' }) }

  const { words, clipCount, clipLength, detectionMode, customGame, volumeSpikes, jobId, priorityHint, sourceUrl, title } = parsed
  if (!words || !jobId) return sendJson(res, 400, { error: 'words and jobId required' })

  // Prevent duplicate scoring for same job
  if (scoringInProgress.has(jobId)) {
    console.log(`[score-clips] Already scoring job ${jobId} — skipping duplicate request`)
    return sendJson(res, 200, { status: 'already_scoring', jobId })
  }
  scoringInProgress.add(jobId)

  sendJson(res, 200, { status: 'scoring', jobId }) // Respond immediately

  // Run Gemini in background
  ;(async () => {
    try {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY
      const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-pro-preview'
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
      const OPENROUTER_CLIP_MODEL = process.env.OPENROUTER_CLIP_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free'
      const CLIP_SCORER = (process.env.CLIP_SCORER || 'gemini').toLowerCase()
      const FULL_TRANSCRIPT_SCOUT = (process.env.FULL_TRANSCRIPT_SCOUT || 'openrouter').toLowerCase()
      if (!GEMINI_API_KEY && !OPENROUTER_API_KEY) throw new Error('No GEMINI_API_KEY or OPENROUTER_API_KEY configured')

      const totalSec = (words[words.length - 1]?.end ?? 0) / 1000
      const introSkipMin = totalSec > 1800 ? 7 : 2
      const videoDurationMin = Math.round(totalSec / 60)
      const introSkipSec = introSkipMin * 60
      const customGameHint = customGame?.trim() ? `\nUser override hint: ${customGame}` : ''
      const priorityHintText = typeof priorityHint === 'string' ? priorityHint.trim().slice(0, 180) : ''
      const priorityProfile = buildPriorityProfile(priorityHintText, detectionMode)
      const priorityHintBlock = priorityHintText
        ? `\nUser priority hint (soft preference only): ${priorityHintText}\nTreat this as an additive bias, not a hard rule. Do not force weak clips just because they loosely match it.`
        : ''
      const priorityStrictnessBlock = priorityProfile.gameplayRequested
        ? '\n- Because the user asked for gameplay/action moments, lyrics, singing, ambient montage, or vibe-only sections without concrete gameplay payoff should score 5 or below and should not be selected.'
        : ''
      if (priorityHintText) {
        console.log(`[score-clips] Priority hint for job ${jobId}: ${priorityHintText}`)
      }

      const modeInstructions = {
        gaming: 'Prioritize real gameplay payoff: kills, wipes, clutches, wins, objectives, close calls.',
        funny: 'Prioritize funny gameplay, fails, bizarre reactions, and comedic moments that still feel clip-worthy.',
        conversation: 'Prioritize memorable dialogue, takes, stories, or emotional beats. Gameplay action is optional.',
        default: 'Prioritize the most shareable moments with clear payoff.',
      }
      const clipFocus = modeInstructions[detectionMode] || modeInstructions.default

      const segments = buildTranscriptSegments(words, 10)
      const sampled = sampleSegmentsEvenly(segments)
      if (sampled.length !== segments.length) {
        console.log(`[score-clips] Transcript sampled: ${segments.length} → ${sampled.length} segments for genre detection`)
      }

      const transcriptText = sampled
        .map((segment) => `[${formatClock(segment.startSec)}] ${segment.text}`)
        .join('\n')
      const titleContext = typeof title === 'string' && title.trim() ? `TITLE: ${title.trim()}\n` : ''
      const classificationText = `${titleContext}${transcriptText}`
      const signatureHit = detectGameBySignatures(classificationText)

      let genreInfo = {
        game: customGame?.trim() || signatureHit?.game || 'gaming stream',
        genrePack: signatureHit?.genrePack || 'general_gaming',
        confidence: customGame?.trim() ? 'user' : signatureHit ? 'high' : 'low',
      }

      try {
        if (customGame?.trim() || signatureHit) {
          throw new Error('Genre already locked by user/signature hint')
        }
        const genrePrompt = `You are classifying a gaming stream from transcript excerpts.
Choose exactly one genrePack from this list only:
- shooter
- extraction_shooter
- battle_royale
- sports
- social_sandbox
- survival_crafting
- general_gaming${customGameHint}

Return JSON only on one line:
{"game":"<specific game if obvious, otherwise broad label>","genrePack":"<one listed value>","confidence":"high|medium|low"}

${titleContext}TRANSCRIPT EXCERPTS:\n${transcriptText}`

        if (!GEMINI_API_KEY) throw new Error('No Gemini key for genre detection')
        const genreContent = await callGeminiText(GEMINI_API_KEY, GEMINI_MODEL, genrePrompt, { maxOutputTokens: 512, temperature: 0.1 })
        const genreJson = extractJsonObject(genreContent)
        if (genreJson) {
          const parsedGenre = JSON.parse(genreJson)
          genreInfo = {
            game: customGame?.trim() || parsedGenre.game || genreInfo.game,
            genrePack: signatureHit?.genrePack || normalizeGenrePack(parsedGenre.genrePack),
            confidence: parsedGenre.confidence || genreInfo.confidence,
          }
        }
      } catch (error) {
        console.warn('[score-clips] Genre detection fallback:', error.message)
      }

      const detectedGame = genreInfo.game || 'gaming stream'
      const detectedGenrePack = normalizeGenrePack(genreInfo.genrePack)
      const detectedPackLabel = GENRE_PACK_LABELS[detectedGenrePack] || detectedGenrePack

      if (jobId) {
        await mergeJobProgress(jobId, {
          phase: 'scoring',
          progress: `Context locked: ${detectedGame}. Selecting clips...`,
          streamContext: `${detectedGame} (${detectedPackLabel})`,
        }, 'processing')
      }

      const eventChunks = buildEventChunks(words, introSkipSec, totalSec)
      const fallbackChunks = segments.map((segment) => ({
        startSec: segment.startSec,
        endSec: Math.min(totalSec, segment.startSec + 10),
        durationSec: Math.min(10, Math.max(4, totalSec - segment.startSec)),
        words: segment.text.split(/\s+/),
        text: segment.text,
      }))
      const actionCueChunks = buildActionCueChunks(words, introSkipSec, totalSec, priorityProfile)
      const audioActionChunks = buildAudioActionChunks(volumeSpikes, words, introSkipSec, totalSec, clipLength)
      const chunkSource = eventChunks.length > 0
        ? mergeChunkSources([...audioActionChunks, ...eventChunks], [...actionCueChunks, ...fallbackChunks])
        : mergeChunkSources([...audioActionChunks, ...actionCueChunks], fallbackChunks)

      let scoredCandidates = chunkSource
        .map((chunk) => scoreEventChunk(chunk, volumeSpikes, detectedGenrePack, detectionMode, priorityProfile))
        .filter((chunk) => {
          if (chunk.score > 0) return true
          if (hasActionPriority(priorityProfile)) {
            return Boolean(
              chunk.hasGameplayPayoff ||
              chunk.actionShotMatches?.length ||
              chunk.priorityMatches?.length
            )
          }
          return false
        })

      let scoutCandidatesAdded = 0
      if (FULL_TRANSCRIPT_SCOUT === 'openrouter' && OPENROUTER_API_KEY && !priorityHintText) {
        try {
          const scoutTranscript = buildWholeTranscriptForScout(segments)
          const scoutPrompt = `You are scanning a full ${videoDurationMin}-minute ${detectedPackLabel} stream transcript to find viral clip candidates that local chunk scoring might miss.
Detected game/context: ${detectedGame}.${customGameHint}
${priorityHintText ? `User priority hint: ${priorityHintText}` : ''}

Look across the WHOLE transcript and return a WIDE candidate set: ideally 30-60 possible moments.
Include obvious viral moments, second-tier usable moments, and quiet gameplay payoffs the chunk scorer may miss: kills/clutches/objectives, funny failures, rage/laugh reactions, sudden audio spikes, quotable lines, or weird context shifts.
Skip intros, pure setup chatter, music/lyrics, generic ROI talk, and weak vibes, but do not be too conservative. Gemini will judge later.
Use absolute stream seconds from the timestamps.
Return compact JSON only:
{"moments":[{"s":1060,"v":8,"r":"SMG laser beam reaction with payoff"}]}

FULL TRANSCRIPT:
${scoutTranscript}`
          const scoutContent = await callOpenRouterText(OPENROUTER_API_KEY, OPENROUTER_CLIP_MODEL, scoutPrompt, { temperature: 0.2, maxOutputTokens: 6000, timeoutMs: 90000 })
          const scoutJson = extractJsonObject(scoutContent)
          if (scoutJson) {
            let scoutParsed
            try {
              scoutParsed = JSON.parse(scoutJson)
            } catch (scoutParseError) {
              const momentMatches = [...scoutJson.matchAll(/\{\s*\"s\"\s*:\s*(\d+)\s*,\s*\"v\"\s*:\s*(\d+)\s*,\s*\"r\"\s*:\s*\"([^\"\\]*)/g)]
              scoutParsed = { moments: momentMatches.map((m) => ({ s: Number(m[1]), v: Number(m[2]), r: m[3] })) }
              console.warn(`[score-clips] Whole-transcript scout JSON was malformed; recovered ${scoutParsed.moments.length} moments`)
            }
            const scoutChunks = buildScoutChunksFromMoments(scoutParsed.moments || scoutParsed.clips || [], words, introSkipSec, totalSec, clipLength)
            const boostedScoutCandidates = scoutChunks
              .map((chunk) => {
                const scored = scoreEventChunk(chunk, volumeSpikes, detectedGenrePack, detectionMode, priorityProfile)
                const scoutBoost = Math.max(20, Math.min(45, (chunk.scoutScore || 7) * 4))
                return {
                  ...scored,
                  score: scored.score + scoutBoost,
                  wholeTranscriptScout: true,
                  scoutReason: chunk.scoutReason,
                }
              })
              .filter((candidate) => candidate.score > -8 || candidate.signalDensity >= 1 || candidate.wholeTranscriptScout)

            scoredCandidates = mergeChunkSources(boostedScoutCandidates, scoredCandidates)
            scoutCandidatesAdded = boostedScoutCandidates.length
            console.log(`[score-clips] Whole-transcript scout added ${scoutCandidatesAdded} candidates via ${OPENROUTER_CLIP_MODEL}`)
          } else {
            console.warn('[score-clips] Whole-transcript scout returned no JSON; continuing with local candidates')
          }
        } catch (scoutError) {
          console.warn(`[score-clips] Whole-transcript scout failed: ${scoutError.message}`)
        }
      }

      scoredCandidates = scoredCandidates
        .sort((a, b) => getCandidatePriorityRank(b, priorityProfile) - getCandidatePriorityRank(a, priorityProfile))

      const gameplayStrict = isGameplayStrictMode(priorityProfile, detectionMode)
      const targetCandidates = pickCandidatePoolSize(videoDurationMin, clipCount, priorityProfile, detectionMode)
      const topCandidates = buildCandidatePool(scoredCandidates, totalSec, targetCandidates, priorityProfile, detectionMode).sort((a, b) => {
        const rankDelta = getCandidatePriorityRank(b, priorityProfile) - getCandidatePriorityRank(a, priorityProfile)
        if (rankDelta !== 0) return rankDelta
        return a.startSec - b.startSec
      })
      const promptCandidates = selectPromptCandidatesWithCoverage(
        topCandidates,
        totalSec,
        Math.min(topCandidates.length, 64),
        priorityProfile,
        detectionMode,
      )
      const shortlistCount = gameplayStrict
        ? Math.min(96, Math.max(clipCount * 9, 40))
        : Math.min(90, Math.max(clipCount * 8, 36))
      console.log(`[score-clips] ${detectedGame} → ${detectedPackLabel}; ${chunkSource.length} chunks scored, ${topCandidates.length} candidates pooled, ${promptCandidates.length} sent to Gemini`)

      if (topCandidates.length === 0) {
        throw new Error('No viable candidates after chunk scoring')
      }

      const spikeContext = (volumeSpikes?.length ?? 0) > 0
        ? `\nAUDIO PEAKS: ${volumeSpikes.slice(0, 20).map((spike) => `[${formatClock(spike.startSec)}]`).join(', ')}`
        : ''

      const candidatesText = promptCandidates.map(formatCandidateLine).join('\n')
      const scoringRubric = `
Use the score scale strictly:
- 10 = best-in-stream, undeniable gameplay payoff + strong reaction. Extremely rare.
- 9 = elite peak clip, clearly one of the strongest moments.
- 8 = strong, very usable highlight.
- 6-7 = decent clip, but not top-tier.
- 4-5 = setup, chatter, planning, or weak payoff.
- 1-3 = ignore.

Calibration rules:
- Conversation-only or hype-only clips can never exceed 5.
- Reaction without clear payoff usually tops out at 6 or 7.
- Most candidates should land between 4 and 7.
- At most two clips should score 9 or higher, and zero is acceptable.
- Use 10 only if it feels like a true top moment from the whole stream.`

      const aiPrompt = `You are the final clip judge for a ${videoDurationMin}-minute ${detectedPackLabel} stream.
Detected game: ${detectedGame}
Genre pack used for pre-scoring: ${detectedPackLabel}.${customGameHint}
${priorityHintBlock}

Task: Rank the best candidate moments from the list below.
Return a broad ranked list, not just the obvious safest picks. Aim for at least ${Math.max(clipCount * 3, 24)} candidates and up to ${shortlistCount}; the app will dedupe and keep the best ${clipCount}.
Only return fewer than ${clipCount * 2} if the source is truly empty of usable moments.
${clipFocus}
${scoringRubric}

Important selection rules:
- Skip the first ${introSkipMin} minutes.
- Prefer real payoff over setup chatter.
- You MAY keep close timestamps when they are distinct beats of the same fight or sequence.
- Do NOT return duplicate angles of the exact same moment.
- If a candidate is mostly setup chatter, regrouping, or aftermath around a stronger nearby clip, skip it instead of filling the slot.
- Favor clips with clear gameplay action, objective swings, or strong comedy payoff when appropriate.
- When the user provides a priority hint, prefer candidates that directly match those cues over generic reactions or between-round chatter.
- Quiet action callouts still count. If the transcript says things like "got him", "flag secured", "revenge", or other low-key payoff phrases, do not throw them away just because the reaction is not huge.
- For s, use the candidate's absolute stream start second from the timestamp itself, like 1978 or 2656. Never return list positions like 32 or 44.
${priorityStrictnessBlock}
${spikeContext}
- Candidates tagged GUN came from dense loud audio sections that may indicate shots/fights/explosions even when transcript is quiet. Treat them as important action candidates and inspect nearby transcript carefully.

CANDIDATES (${promptCandidates.length}):
${candidatesText}

Return ONLY compact JSON on ONE LINE:
{"clips":[{"s":1978,"v":7,"r":"fair exchange kill"},{"s":2656,"v":8,"r":"flag secured payoff"}]}`

      console.log(`[score-clips] Calling clip scorer (${CLIP_SCORER}) for job ${jobId} (${promptCandidates.length} candidates, ${chunkSource.length} chunks, ${words.length} words)`)

      let content = ''
      let scorerUsed = 'gemini'
      let scorerComparison = null
      let geminiContent = ''
      let openRouterContent = ''

      if (CLIP_SCORER === 'ab' && GEMINI_API_KEY) {
        geminiContent = await callGeminiText(GEMINI_API_KEY, GEMINI_MODEL, aiPrompt, { temperature: 0.2, maxOutputTokens: 4000 })
      }

      if ((CLIP_SCORER === 'openrouter' || CLIP_SCORER === 'ab') && OPENROUTER_API_KEY) {
        try {
          openRouterContent = await callOpenRouterText(OPENROUTER_API_KEY, OPENROUTER_CLIP_MODEL, aiPrompt, { temperature: 0.2, maxOutputTokens: 4000 })
          content = openRouterContent
          scorerUsed = 'openrouter'
        } catch (openRouterError) {
          console.warn(`[openrouter] scorer failed for job ${jobId}: ${openRouterError.message}`)
          if (!geminiContent && GEMINI_API_KEY) {
            geminiContent = await callGeminiText(GEMINI_API_KEY, GEMINI_MODEL, aiPrompt, { temperature: 0.2, maxOutputTokens: 4000 })
          }
          if (!geminiContent) throw openRouterError
          content = geminiContent
          scorerUsed = 'gemini_fallback'
        }
      } else {
        if (!GEMINI_API_KEY) throw new Error('Gemini scorer requested but GEMINI_API_KEY is missing')
        try {
          geminiContent = geminiContent || await callGeminiText(GEMINI_API_KEY, GEMINI_MODEL, aiPrompt, { temperature: 0.2, maxOutputTokens: 4000, retries: 1, timeoutMs: 30000 })
          content = geminiContent
        } catch (geminiError) {
          console.warn(`[score-clips] Gemini scorer timed out/failed for ${jobId}; falling back to local candidate scoring: ${geminiError.message}`)
          content = '{"clips":[]}'
          scorerUsed = 'local_fallback'
        }
      }

      if (CLIP_SCORER === 'ab') {
        scorerComparison = {
          selected: scorerUsed,
          gemini: { model: GEMINI_MODEL, responseChars: geminiContent.length, preview: geminiContent.substring(0, 500) },
          openrouter: { model: OPENROUTER_CLIP_MODEL, responseChars: openRouterContent.length, preview: openRouterContent.substring(0, 500) },
        }
      }

      console.log(`[score-clips] ${scorerUsed} raw response (${content.length} chars): "${content.substring(0, 200)}"`)
      let jsonPayload = extractJsonObject(content)
      if (!jsonPayload && scorerUsed === 'openrouter' && geminiContent) {
        console.warn(`[score-clips] OpenRouter returned no JSON for ${jobId}; using Gemini fallback response`)
        content = geminiContent
        scorerUsed = 'gemini_fallback'
        jsonPayload = extractJsonObject(content)
      }
      if (!jsonPayload) throw new Error(`No JSON found in ${scorerUsed} response`)
      // Fix common JSON issues: unescaped quotes in strings, truncated arrays
      let jsonStr = jsonPayload
      // Try parse — if fails, use a lenient approach
      let gemParsed
      try {
        gemParsed = JSON.parse(jsonStr)
      } catch (parseErr) {
        console.warn('[score-clips] JSON parse failed, trying to extract partial clips...')
        // Try compact format first {"s":N,"v":N,"r":"..."}
        const compactMatches = [...jsonStr.matchAll(/\{"s"\s*:\s*(\d+)\s*,\s*"v"\s*:\s*(\d+)\s*,\s*"r"\s*:\s*"([^"\\]*)"/g)]
        // Fall back to full format
        const fullMatches = [...jsonStr.matchAll(/\{\s*"start_sec"\s*:\s*(\d+)\s*,\s*"virality_score"\s*:\s*(\d+)\s*,\s*"ai_reason"\s*:\s*"([^"\\]*)"/g)]
        const clipMatches = compactMatches.length > 0 ? compactMatches : fullMatches
        gemParsed = {
          clips: clipMatches.map(m => ({ s: parseInt(m[1]), v: parseInt(m[2]), r: m[3] }))
        }
        console.log(`[score-clips] Partial parse: clips=${gemParsed.clips.length}`)
      }

      const clips = gemParsed.clips ?? []
      console.log(`[score-clips] ${scorerUsed} returned ${clips.length} clips for ${detectedGame}`)

      if (clips.length === 0) {
        console.warn(`[score-clips] ${scorerUsed} returned 0 clips for ${jobId}; falling back to local quality gates only`)
      }

      // Deduplicate by overlap / transcript similarity, not hard spacing
      const selectedClips = []
      const result = []
      let duplicateClipsRemoved = 0
      let backfilledClipsAdded = 0
      for (const c of clips.slice(0, shortlistCount * 2)) {
        const startSec = normalizeModelClipStartSec(c.s ?? c.start_sec ?? 0, promptCandidates, introSkipSec, totalSec)
        const score = c.v ?? c.virality_score ?? 7
        if (startSec === 0 && result.length > 0) continue
        if (score < 5) continue

        const payload = buildPriorityAwareClipPayload(startSec, score, c.r || c.ai_reason, words, clipLength, detectionMode, priorityProfile)
        if (!payload) continue
        const supportingCandidate = findSupportingCandidate(scoredCandidates, startSec, clipLength)
        if (gameplayStrict && supportingCandidate && !passesGameplayPriorityGate(supportingCandidate, priorityProfile, detectionMode)) {
          continue
        }
        if (!clipTextMatchesGameplayAsk(payload.selectedWindow.text, priorityProfile, detectionMode)) {
          continue
        }
        if (isLowPayoffClipWindow(payload.selectedWindow.text, priorityProfile, detectionMode)) {
          continue
        }
        if (shouldSkipPriorityAdjacentSetup(selectedClips, payload.selectedWindow, priorityProfile)) {
          continue
        }

        if (shouldSkipDuplicateClip(selectedClips, payload.selectedWindow.startSec, payload.selectedWindow.endSec, payload.selectedWindow.text, clipLength)) {
          duplicateClipsRemoved += 1
          continue
        }
        selectedClips.push(payload.selectedWindow)
        result.push(payload.clip)
        if (result.length >= clipCount) break
      }

      if (result.length < clipCount) {
        const backfillThreshold = hasActionPriority(priorityProfile) ? 6 : gameplayStrict ? 8 : 10
        for (const candidate of scoredCandidates) {
          if (result.length >= clipCount) break
          if (candidate.score < backfillThreshold) continue
          if (!passesGameplayPriorityGate(candidate, priorityProfile, detectionMode)) continue
          if (!candidate.hasGameplayPayoff && candidate.signalDensity < 1 && !candidate.wholeTranscriptScout && candidate.spikeHits < 1) continue

          const payload = buildPriorityAwareClipPayload(
            Math.max(0, Math.round(candidate.startSec)),
            mapCandidateScoreToVirality(candidate.score),
            buildClipReasonFromWindow(candidate.text, detectionMode),
            words,
            clipLength,
            detectionMode,
            priorityProfile,
          )

          if (!payload) continue
          if (!clipTextMatchesGameplayAsk(payload.selectedWindow.text, priorityProfile, detectionMode)) continue
          if (isLowPayoffClipWindow(payload.selectedWindow.text, priorityProfile, detectionMode)) continue
          if (shouldSkipPriorityAdjacentSetup(selectedClips, payload.selectedWindow, priorityProfile)) continue
          if (shouldSkipDuplicateClip(selectedClips, payload.selectedWindow.startSec, payload.selectedWindow.endSec, payload.selectedWindow.text, clipLength)) continue

          selectedClips.push(payload.selectedWindow)
          result.push(payload.clip)
          backfilledClipsAdded += 1
        }
      }

      if (result.length < clipCount) {
        for (const candidate of topCandidates) {
          if (result.length >= clipCount) break
          if (candidate.score < 3 && !candidate.wholeTranscriptScout && candidate.signalDensity < 1 && candidate.spikeHits < 1) continue

          const payload = buildPriorityAwareClipPayload(
            Math.max(0, Math.round(candidate.startSec)),
            mapCandidateScoreToVirality(Math.max(candidate.score, 8)),
            candidate.scoutReason || buildClipReasonFromWindow(candidate.text, detectionMode),
            words,
            clipLength,
            detectionMode,
            priorityProfile,
          )

          if (!payload) continue
          if (shouldSkipDuplicateClip(selectedClips, payload.selectedWindow.startSec, payload.selectedWindow.endSec, payload.selectedWindow.text, clipLength)) continue
          if (isLowPayoffClipWindow(payload.selectedWindow.text, priorityProfile, detectionMode) && !candidate.wholeTranscriptScout && candidate.spikeHits < 1) continue

          selectedClips.push(payload.selectedWindow)
          result.push(payload.clip)
          backfilledClipsAdded += 1
        }
      }

      let clipShortfallReason
      if (result.length < clipCount && hasActionPriority(priorityProfile)) {
        for (const candidate of scoredCandidates) {
          if (result.length >= clipCount) break
          if (!isDirectActionCandidate(candidate)) continue
          if (candidate.score < 10) continue

          const payload = buildPriorityAwareClipPayload(
            Math.max(0, Math.round(candidate.startSec)),
            mapCandidateScoreToVirality(candidate.score),
            buildClipReasonFromWindow(candidate.text, detectionMode),
            words,
            clipLength,
            detectionMode,
            priorityProfile,
          )

          if (!payload) continue
          if (!clipTextMatchesGameplayAsk(payload.selectedWindow.text, priorityProfile, detectionMode)) continue
          if (isLowPayoffClipWindow(payload.selectedWindow.text, priorityProfile, detectionMode)) continue
          if (shouldSkipPriorityAdjacentSetup(selectedClips, payload.selectedWindow, priorityProfile)) continue
          if (shouldSkipDuplicateClip(selectedClips, payload.selectedWindow.startSec, payload.selectedWindow.endSec, payload.selectedWindow.text, clipLength)) continue

          selectedClips.push(payload.selectedWindow)
          result.push(payload.clip)
          backfilledClipsAdded += 1
        }
      }

      let explicitActionDrops = 0
      if (hasExplicitActionPriority(priorityProfile) && result.length > 0) {
        for (let index = result.length - 1; index >= 0; index -= 1) {
          if (!shouldDropExplicitActionClip(result[index], priorityProfile)) continue
          result.splice(index, 1)
          selectedClips.splice(index, 1)
          explicitActionDrops += 1
        }
      }

      if (result.length < clipCount) {
        const coverageCandidates = sortCandidatesForCoverageBackfill(
          topCandidates.filter((candidate) => candidate.startSec >= introSkipSec),
          selectedClips,
          totalSec,
          priorityProfile,
        )
        for (const candidate of coverageCandidates) {
          if (result.length >= clipCount) break
          const payload = buildPriorityAwareClipPayload(
            Math.max(0, Math.round(candidate.startSec)),
            Math.max(5, mapCandidateScoreToVirality(candidate.score || 5)),
            candidate.scoutReason || buildClipReasonFromWindow(candidate.text, detectionMode),
            words,
            clipLength,
            detectionMode,
            priorityProfile,
          )
          if (!payload) continue
          if (shouldSkipDuplicateClip(selectedClips, payload.selectedWindow.startSec, payload.selectedWindow.endSec, payload.selectedWindow.text, clipLength)) continue
          selectedClips.push(payload.selectedWindow)
          result.push(payload.clip)
          backfilledClipsAdded += 1
        }
      }

      if (result.length < clipCount) {
        if (result.length === 0) {
          clipShortfallReason = priorityProfile.gameplayRequested
            ? `Requested ${clipCount}, delivered 0. No strong gameplay moments matched the current source and priority hint.`
            : `Requested ${clipCount}, delivered 0. No strong distinct moments were found in the current source.`
        } else {
          clipShortfallReason = `Requested ${clipCount}, delivered ${result.length}. ${duplicateClipsRemoved > 0 ? `${duplicateClipsRemoved} near-duplicate moments were collapsed.` : 'Gemini returned fewer unique moments than requested.'}${backfilledClipsAdded > 0 ? ` Added ${backfilledClipsAdded} extra moments from local scoring, but the run still came up short.` : ''}${explicitActionDrops > 0 ? ` Removed ${explicitActionDrops} off-target moments after final action-priority filtering.` : ''}`
        }
      }

      {
        const currentJob = await fetchJob(jobId)
        if (currentJob?.status === 'complete') {
          console.log(`[score-clips] Job ${jobId} already complete — skipping push`)
        } else {
          const visualProofClips = await enrichClipsWithVisualProofFrames(result, sourceUrl, totalSec)
          await updateJob(jobId, {
            status: 'complete',
            progress: {
              ...(currentJob?.progress || {}),
              phase: 'complete',
              progress: visualProofClips.length ? 'Clip selection complete.' : 'No strong clips matched the request.',
              completedClips: visualProofClips,
              streamContext: `${detectedGame} (${detectedPackLabel})`,
              requestedClipCount: clipCount,
              shortlistClipCount: shortlistCount,
              aiReturnedClipCount: clips.length,
              clipScorer: scorerUsed,
              scorerComparison,
              duplicateClipsRemoved,
              deliveredClipCount: visualProofClips.length,
              clipShortfallReason,
              completedAt: new Date().toISOString(),
            },
          })
          console.log(`[score-clips] Pushed ${visualProofClips.length} clips to ${getJobStoreKind()} job ${jobId}`)
        }
      }
    } catch (err) {
      console.error('[score-clips] Error:', err.message)
      if (jobId) {
        try {
          await mergeJobProgress(jobId, {
            phase: 'failed',
            progress: err.message,
          }, 'failed')
        } catch {}
      }
    } finally {
      scoringInProgress.delete(jobId) // Always release the lock
    }
  })()
}

async function waitForTranscriptionEntry(transcribeId, timeoutMs = 90 * 60 * 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const entry = getTranscription(transcribeId)
    if (entry?.status === 'complete') return entry
    if (entry?.status === 'error') throw new Error(entry.error || 'Transcription failed')
    await sleep(2000)
  }
  throw new Error('Timed out waiting for transcription')
}

async function waitForJobTerminal(jobId, timeoutMs = 20 * 60 * 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const job = await fetchJob(jobId)
    if (job?.status === 'complete' || job?.status === 'failed') return job
    await sleep(2000)
  }
  throw new Error('Timed out waiting for scoring')
}

async function handleJobStart(req, res) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  let parsed
  try { parsed = JSON.parse(raw) } catch { return sendJson(res, 400, { error: 'Invalid JSON' }) }

  const { jobId, title, sourceUrl, rawInputUrl, options, inputKind, rescoreOnly } = parsed
  if (!jobId || !options) return sendJson(res, 400, { error: 'jobId and options required' })

  if (activeJobRuns.has(jobId)) {
    return sendJson(res, 200, { status: 'already_running', jobId })
  }

  activeJobRuns.add(jobId)
  sendJson(res, 200, { status: 'started', jobId })

  ;(async () => {
    try {
      let finalSourceUrl = sourceUrl
      let resolvedTitle = title || 'Untitled stream'

      if (rescoreOnly) {
        await mergeJobProgress(jobId, {
          phase: 'scoring',
          progress: 'Re-scoring cached transcript...',
          deliveredClipCount: 0,
          completedClips: [],
          inputKind: 'rescore',
        }, 'processing')
      } else if (inputKind === 'remote_url') {
        await mergeJobProgress(jobId, {
          phase: 'downloading',
          progress: 'Downloading source stream...',
          sourceReady: false,
        }, 'processing')

        const downloaded = await ensureDownloadedSource(rawInputUrl)
        finalSourceUrl = downloaded.publicUrl
        resolvedTitle = downloaded.title || resolvedTitle

        await updateJob(jobId, { title: resolvedTitle, source_url: finalSourceUrl })
        await mergeJobProgress(jobId, {
          phase: 'transcribing',
          progress: downloaded.cached ? 'Download cache hit, starting transcription...' : 'Download complete, starting transcription...',
          sourceReady: true,
        }, 'processing')
      } else {
        await mergeJobProgress(jobId, {
          phase: 'transcribing',
          progress: sourceUrl ? 'Upload complete, starting transcription...' : 'Waiting for uploaded media...',
          sourceReady: Boolean(sourceUrl),
        }, 'processing')
      }

      if (!finalSourceUrl) throw new Error('No source URL available for processing')

      const transcribeRes = await fetch(`http://127.0.0.1:${PORT}/transcribe-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl: finalSourceUrl, jobId }),
      })
      if (!transcribeRes.ok) {
        throw new Error(await transcribeRes.text())
      }
      const transcribeData = await transcribeRes.json()
      const transcriptionEntry = await waitForTranscriptionEntry(transcribeData.transcribeId)

      const filteredWords = (transcriptionEntry.result?.words || []).filter((word) => {
        const token = (word.text || '').trim()
        if (!token) return false
        if (token.startsWith('[') && token.endsWith(']')) return false
        if (token.startsWith('(') && token.endsWith(')')) return false
        return true
      })

      await mergeJobProgress(jobId, {
        phase: 'analyzing',
        progress: 'Detecting game and stream context...',
        transcriptWordCount: filteredWords.length,
        volumeSpikeCount: transcriptionEntry.volumeSpikes?.length || 0,
        sourceReady: true,
      }, 'processing')

      const scoreRes = await fetch(`http://127.0.0.1:${PORT}/score-clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: filteredWords,
          clipCount: options.clipCount,
          clipLength: parseInt(options.clipLength, 10),
          detectionMode: options.detectionMode,
          customGame: options.customGame,
          priorityHint: options.priorityHint,
          volumeSpikes: transcriptionEntry.volumeSpikes || [],
          jobId,
          title: resolvedTitle,
          sourceUrl: finalSourceUrl,
        }),
      })
      if (!scoreRes.ok) throw new Error(await scoreRes.text())

      const terminalJob = await waitForJobTerminal(jobId)
      if (terminalJob?.status === 'failed') {
        throw new Error(terminalJob.progress?.progress || 'Scoring failed')
      }
    } catch (error) {
      console.error('[job-start] Error:', error.message)
      await mergeJobProgress(jobId, {
        phase: 'failed',
        progress: error.message,
      }, 'failed')
    } finally {
      activeJobRuns.delete(jobId)
      cleanupTempArtifacts()
    }
  })()
}

function handleTranscribePoll(req, res) {
  const transcribeId = req.url.split('/transcribe-poll/')[1]
  const entry = getTranscription(transcribeId)
  if (!entry) return sendJson(res, 404, { error: 'Transcription not found' })

  sendJson(res, 200, entry)

  if (entry.status === 'complete' || entry.status === 'error') {
    setTimeout(() => {
      const f = path.join(TRANSCRIPTION_DIR, `${transcribeId}.json`)
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }, 30 * 60 * 1000) // 30 min TTL
  }
}

// ─── Async download: start + poll endpoints ───
async function handleDownloadStart(req, res) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  let parsed
  try { parsed = JSON.parse(raw) } catch { return sendJson(res, 400, { error: 'Invalid JSON' }) }

  const { url } = parsed
  if (!url) return sendJson(res, 400, { error: 'url is required' })

  // Check cache first
  const cached = getFromCache(url)
  if (cached) {
    return sendJson(res, 200, { cached: true, publicUrl: cached.publicUrl, title: cached.title, duration: cached.duration })
  }

  // Start async download
  const downloadId = crypto.randomBytes(8).toString('hex')
  activeDownloads.set(downloadId, { status: 'downloading', progress: 'Starting...' })

  console.log(`[download-start] ${downloadId} for ${url}`)

  // Run download in background
  ;(async () => {
    try {
      const info = getVideoInfo(url)
      const durStr = info.duration > 0 ? ` (${Math.round(info.duration / 60)}min)` : ''
      activeDownloads.set(downloadId, { status: 'downloading', progress: `${info.title}${durStr}` })

      if (info.duration > MAX_DURATION_SEC) {
        activeDownloads.set(downloadId, { status: 'error', error: `Video too long: ${Math.round(info.duration / 60)}min (max ${MAX_DURATION_SEC / 60}min)` })
        return
      }

      const fileId = crypto.randomBytes(8).toString('hex')
      const outputTemplate = path.join(TEMP_DIR, `${fileId}.%(ext)s`)
      await downloadAudio(url, outputTemplate)

      const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(fileId))
      if (files.length === 0) { activeDownloads.set(downloadId, { status: 'error', error: 'No output file' }); return }

      const outputFile = path.join(TEMP_DIR, files[0])
      const fileExt = path.extname(files[0]) || '.mp4'
      const serveFileName = `${fileId}-${info.id}${fileExt}`
      const servePath = path.join(TEMP_DIR, serveFileName)
      if (outputFile !== servePath) fs.renameSync(outputFile, servePath)

      let tunnelUrl = ''
      try {
        const tunnelFile = path.join(__dirname, 'tunnel-url.txt')
        if (fs.existsSync(tunnelFile)) tunnelUrl = fs.readFileSync(tunnelFile, 'utf8').trim()
      } catch {}

      const publicUrl = tunnelUrl ? `${tunnelUrl}/serve/${serveFileName}` : `http://localhost:${PORT}/serve/${serveFileName}`
      setCache(url, { publicUrl, duration: info.duration, title: info.title, videoId: info.id, filePath: servePath })

      activeDownloads.set(downloadId, { status: 'complete', publicUrl, title: info.title, duration: info.duration })
      console.log(`[download-start] ${downloadId} complete: ${publicUrl}`)
    } catch (err) {
      console.error(`[download-start] ${downloadId} error:`, err.message)
      activeDownloads.set(downloadId, { status: 'error', error: err.message })
    }
  })()

  sendJson(res, 200, { downloadId, cached: false })
}

function handleDownloadPoll(req, res) {
  const downloadId = req.url.split('/download-poll/')[1]
  const entry = activeDownloads.get(downloadId)
  if (!entry) return sendJson(res, 404, { error: 'Download not found' })

  sendJson(res, 200, entry)

  // Clean up completed/errored downloads after poll
  if (entry.status === 'complete' || entry.status === 'error') {
    setTimeout(() => activeDownloads.delete(downloadId), 60000)
  }
}

// ─── Upload endpoint: receive local file uploads ───
async function handleUpload(req, res) {
  try {
    const fileId = crypto.randomBytes(8).toString('hex')
    const chunks = []
    let totalSize = 0
    let fileName = `${fileId}.mp4`

    // Parse multipart form data (simple approach)
    const contentType = req.headers['content-type'] || ''

    if (contentType.includes('multipart/form-data')) {
      const boundary = contentType.split('boundary=')[1]
      if (!boundary) return sendJson(res, 400, { error: 'Missing boundary' })

      const rawChunks = []
      for await (const chunk of req) rawChunks.push(chunk)
      const raw = Buffer.concat(rawChunks)

      // Extract filename from Content-Disposition
      const headerEnd = raw.indexOf('\r\n\r\n')
      if (headerEnd === -1) return sendJson(res, 400, { error: 'Invalid multipart' })

      const headerStr = raw.slice(0, headerEnd).toString()
      const fnMatch = headerStr.match(/filename="([^"]+)"/)
      if (fnMatch) {
        const ext = path.extname(fnMatch[1]) || '.mp4'
        fileName = `${fileId}${ext}`
      }

      // Find start and end of file data
      const dataStart = headerEnd + 4
      const endBoundary = Buffer.from(`\r\n--${boundary}`)
      let dataEnd = raw.length
      const boundaryIdx = raw.indexOf(endBoundary, dataStart)
      if (boundaryIdx !== -1) dataEnd = boundaryIdx

      const fileData = raw.slice(dataStart, dataEnd)
      const filePath = path.join(TEMP_DIR, fileName)
      fs.writeFileSync(filePath, fileData)
      totalSize = fileData.length
    } else {
      // Raw binary upload
      for await (const chunk of req) { chunks.push(chunk); totalSize += chunk.length }
      const fileData = Buffer.concat(chunks)
      const filePath = path.join(TEMP_DIR, fileName)
      fs.writeFileSync(filePath, fileData)
    }

    const filePath = path.join(TEMP_DIR, fileName)
    console.log(`[upload] saved: ${fileName} (${(totalSize / 1024 / 1024).toFixed(1)}MB)`)

    // Build public URL via tunnel
    let tunnelUrl = ''
    try {
      const tunnelFile = path.join(__dirname, 'tunnel-url.txt')
      if (fs.existsSync(tunnelFile)) tunnelUrl = fs.readFileSync(tunnelFile, 'utf8').trim()
    } catch {}

    const publicUrl = tunnelUrl
      ? `${tunnelUrl}/serve/${fileName}`
      : `http://localhost:${PORT}/serve/${fileName}`

    sendJson(res, 200, { publicUrl, fileName, size: totalSize })
  } catch (err) {
    console.error('[upload] Error:', err.message)
    sendJson(res, 500, { error: `Upload failed: ${err.message}` })
  }
}

// ─── Thumbnail endpoint: extract frame from video ───
async function handleThumbnail(req, res) {
  try {
    const readThumbnailPayload = async () => {
      if (req.method === 'GET') {
        const url = new URL(req.url, `http://localhost:${PORT}`)
        return {
          sourceUrl: url.searchParams.get('sourceUrl'),
          timestamp: url.searchParams.get('timestamp'),
        }
      }

      let raw = ''
      for await (const chunk of req) raw += chunk
      return JSON.parse(raw)
    }

    const streamThumb = (filePath) => {
      const stat = fs.statSync(filePath)
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      })
      fs.createReadStream(filePath).pipe(res)
    }

    const body = await readThumbnailPayload()
    const { sourceUrl, timestamp } = body

    if (!sourceUrl) return sendJson(res, 400, { error: 'sourceUrl required' })

    const ts = Math.max(0, parseFloat(timestamp || 0) || 0)
    const thumbHash = crypto.createHash('sha1').update(`${sourceUrl}|${ts.toFixed(2)}`).digest('hex').slice(0, 20)
    const thumbFile = path.join(THUMB_CACHE_DIR, `thumb-${thumbHash}.jpg`)

    if (fs.existsSync(thumbFile)) {
      return streamThumb(thumbFile)
    }

    const tempThumbFile = path.join(THUMB_CACHE_DIR, `thumb-${thumbHash}-${crypto.randomBytes(4).toString('hex')}.tmp.jpg`)

    const inputPath = resolveServedInputPath(sourceUrl)

    const cmd = `ffmpeg -ss ${ts} -i "${inputPath}" -vframes 1 -q:v 2 -y "${tempThumbFile}"`
    console.log(`[thumb] extracting frame at ${ts}s`)

    execSync(cmd, { timeout: 15000 })

    if (!fs.existsSync(tempThumbFile)) {
      return sendJson(res, 500, { error: 'Failed to extract frame' })
    }

    fs.renameSync(tempThumbFile, thumbFile)
    streamThumb(thumbFile)
  } catch (err) {
    console.error('[thumb] Error:', err.message)
    sendJson(res, 500, { error: 'Thumbnail extraction failed' })
  }
}

function normalizeStillFormat(value) {
  return value === 'png' ? 'png' : 'jpg'
}

function normalizeStillCrop(value) {
  if (value === 'square' || value === 'portrait') return value
  return 'original'
}

function buildStillOutputArgs({ crop, format, outputFile, preview = false }) {
  const output = shellQuote(outputFile)
  const target = preview
    ? crop === 'portrait'
      ? { w: 360, h: 640 }
      : crop === 'square'
        ? { w: 520, h: 520 }
        : { w: 640, h: 360 }
    : crop === 'portrait'
      ? { w: 1080, h: 1920 }
      : crop === 'square'
        ? { w: 1080, h: 1080 }
        : { w: 1920, h: 1080 }
  const imageCodecArgs = format === 'png'
    ? `-frames:v 1 -compression_level ${preview ? 5 : 2} -y ${output}`
    : `-frames:v 1 -q:v ${preview ? 5 : 1} -y ${output}`

  if (crop === 'portrait') {
    return `-filter_complex "[0:v]split=2[base][fg];[base]scale=${target.w}:${target.h}:force_original_aspect_ratio=increase,crop=${target.w}:${target.h},boxblur=${preview ? '12:1' : '24:2'},eq=saturation=0.82:brightness=-0.05[bg];[fg]scale=${target.w}:${target.h}:force_original_aspect_ratio=decrease[front];[bg][front]overlay=(W-w)/2:(H-h)/2,format=${format === 'png' ? 'rgba' : 'yuvj420p'}" ${imageCodecArgs}`
  }

  if (crop === 'square') {
    return `-vf "scale=${target.w}:${target.h}:force_original_aspect_ratio=increase,crop=${target.w}:${target.h},format=${format === 'png' ? 'rgba' : 'yuvj420p'}" ${imageCodecArgs}`
  }

  return `-filter_complex "[0:v]split=2[base][fg];[base]scale=${target.w}:${target.h}:force_original_aspect_ratio=increase,crop=${target.w}:${target.h},boxblur=${preview ? '12:1' : '24:2'},eq=saturation=0.82:brightness=-0.05[bg];[fg]scale=${target.w}:${target.h}:force_original_aspect_ratio=decrease[front];[bg][front]overlay=(W-w)/2:(H-h)/2,format=${format === 'png' ? 'rgba' : 'yuvj420p'}" ${imageCodecArgs}`
}

function chooseBestStillTimestamp(sourceUrl, targetTimestamp, totalSec, windowSec) {
  const safeWindow = Math.max(0, Math.min(10, Number(windowSec) || 0))
  const baseOffsets = safeWindow > 0
    ? [-safeWindow, -safeWindow * 0.7, -safeWindow * 0.45, -safeWindow * 0.22, 0, safeWindow * 0.22, safeWindow * 0.45, safeWindow * 0.7, safeWindow]
    : [0]
  const maxTimestamp = totalSec ? Math.max(0, totalSec - 0.25) : Number.MAX_SAFE_INTEGER
  const candidates = baseOffsets
    .map((offset) => Math.max(0, Math.min(maxTimestamp, targetTimestamp + offset)))
    .filter((value, index, arr) => Number.isFinite(value) && arr.findIndex((other) => Math.abs(other - value) < 0.04) === index)
    .map((timestamp) => {
      const visual = analyzeProofFrameVisual(sourceUrl, timestamp, totalSec)
      const distancePenalty = Math.abs(timestamp - targetTimestamp) * 0.22
      const centerBonus = Math.abs(timestamp - targetTimestamp) <= 1.25 ? 1.2 : 0
      return { timestamp, visual, rank: (visual.score || 0) + centerBonus - distancePenalty }
    })

  const usable = candidates.filter((candidate) => candidate.visual.usable)
  const ranked = (usable.length ? usable : candidates).sort((a, b) => b.rank - a.rank)
  return ranked[0] || { timestamp: targetTimestamp, visual: { usable: true, score: 0, reason: 'No alternatives sampled.' }, rank: 0 }
}

async function handleStillExport(req, res) {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const sourceUrl = url.searchParams.get('sourceUrl')
    const requestedTimestamp = Math.max(0, parseFloat(url.searchParams.get('timestamp') || '0') || 0)
    const preview = url.searchParams.get('preview') === 'true'
    const format = preview ? 'jpg' : normalizeStillFormat(url.searchParams.get('format'))
    const crop = normalizeStillCrop(url.searchParams.get('crop'))
    const qualitySearch = url.searchParams.get('qualitySearch') !== 'false'
    const qualityWindowSec = Math.max(0, Math.min(10, parseFloat(url.searchParams.get('qualityWindowSec') || '6') || 0))
    const download = url.searchParams.get('download') === 'true'
    const fileBase = (url.searchParams.get('fileName') || 'slicer-still').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'slicer-still'

    if (!sourceUrl) return sendJson(res, 400, { error: 'sourceUrl required' })

    const inputPath = resolveServedInputPath(sourceUrl)
    if (!inputPath || !fs.existsSync(inputPath)) return sendJson(res, 404, { error: 'Source file not found for still export' })

    const totalSec = qualitySearch ? getMediaDuration(inputPath) : null
    const best = qualitySearch
      ? chooseBestStillTimestamp(sourceUrl, requestedTimestamp, totalSec, qualityWindowSec)
      : { timestamp: requestedTimestamp, visual: { score: 0, reason: 'Exact requested frame.' } }
    const selectedTimestamp = Math.max(0, best.timestamp)
    const cacheHash = crypto.createHash('sha1').update(`${sourceUrl}|${requestedTimestamp.toFixed(2)}|${selectedTimestamp.toFixed(2)}|${format}|${crop}|${qualitySearch}|${preview ? 'preview-v1' : 'full-v1'}`).digest('hex').slice(0, 24)
    const outputFile = path.join(STILL_CACHE_DIR, `${preview ? 'still-thumb' : 'still'}-${cacheHash}.${format === 'png' ? 'png' : 'jpg'}`)

    if (!fs.existsSync(outputFile)) {
      const args = buildStillOutputArgs({ crop, format, outputFile, preview })
      const cmd = `ffmpeg -hide_banner -ss ${selectedTimestamp.toFixed(2)} -i ${shellQuote(inputPath)} ${args}`
      console.log(`[still] exporting ${preview ? 'preview ' : ''}${crop}/${format} at ${selectedTimestamp.toFixed(2)}s (requested ${requestedTimestamp.toFixed(2)}s)`)
      execSync(cmd, { timeout: preview ? 12000 : 20000, stdio: ['ignore', 'pipe', 'pipe'] })
    }

    if (!fs.existsSync(outputFile)) return sendJson(res, 500, { error: 'Still file not created' })

    const stat = fs.statSync(outputFile)
    const contentType = format === 'png' ? 'image/png' : 'image/jpeg'
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileBase}.${format === 'png' ? 'png' : 'jpg'}"`,
      'X-Slicer-Requested-Timestamp': requestedTimestamp.toFixed(2),
      'X-Slicer-Selected-Timestamp': selectedTimestamp.toFixed(2),
      'X-Slicer-Still-Score': String(best.visual?.score ?? 0),
      'X-Slicer-Still-Reason': String(best.visual?.reason || ''),
    })
    fs.createReadStream(outputFile).pipe(res)
  } catch (err) {
    console.error('[still] Error:', err.message)
    sendJson(res, 500, { error: 'Still export failed' })
  }
}

// ─── Serve endpoint: stream video files from temp directory ───
function handleServe(req, res) {
  const fileName = decodeURIComponent(req.url.replace('/serve/', ''))
  const filePath = path.join(TEMP_DIR, fileName)

  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'File not found' })
  }

  const stat = fs.statSync(filePath)
  const ext = path.extname(fileName).toLowerCase()
  const contentType = ext === '.mp4' ? 'video/mp4'
    : ext === '.webm' ? 'video/webm'
    : ext === '.mkv' ? 'video/x-matroska'
    : 'application/octet-stream'

  // Support range requests for video seeking
  const range = req.headers.range
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    const chunkSize = end - start + 1

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    })
    fs.createReadStream(filePath, { start, end }).pipe(res)
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    })
    fs.createReadStream(filePath).pipe(res)
  }
}

// ─── Info endpoint: get video duration without downloading ───
async function handleInfo(req, res) {
  try {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    const { url } = body
    if (!url) return sendJson(res, 400, { error: 'url is required' })

    console.log(`[info] Getting info for: ${url}`)

    const { execSync } = require('child_process')
    const result = execSync(
      `yt-dlp --dump-json --no-download "${url}"`,
      { timeout: 30000, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    )

    const info = JSON.parse(result)
    const durationSec = info.duration || 0
    const title = info.title || info.fulltitle || 'Untitled'

    sendJson(res, 200, {
      duration: durationSec,
      durationMin: parseFloat((durationSec / 60).toFixed(1)),
      title,
      estimatedCredits: parseFloat((durationSec / 60).toFixed(1)),
      creditLimit: 300,
      creditUnit: 'min/month',
    })
  } catch (err) {
    console.error('[info] Error:', err.message)
    sendJson(res, 500, { error: 'Failed to get video info' })
  }
}

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    return res.end()
  }

  if (req.method === 'POST' && req.url === '/download-start') {
    handleDownloadStart(req, res)
  } else if (req.method === 'GET' && req.url?.startsWith('/download-poll/')) {
    handleDownloadPoll(req, res)
  } else if (req.method === 'POST' && req.url === '/upload') {
    handleUpload(req, res)
  } else if (req.method === 'POST' && req.url === '/download') {
    handleDownload(req, res)
  } else if (req.method === 'POST' && req.url === '/clip') {
    handleClip(req, res)
  } else if ((req.method === 'POST' || req.method === 'GET') && req.url?.startsWith('/thumbnail')) {
    handleThumbnail(req, res)
  } else if (req.method === 'GET' && req.url?.startsWith('/still')) {
    handleStillExport(req, res)
  } else if (req.method === 'POST' && req.url === '/transcribe-local') {
    handleTranscribeLocal(req, res)
  } else if (req.method === 'POST' && req.url === '/score-clips') {
    handleScoreClips(req, res)
  } else if (req.method === 'POST' && req.url === '/job-start') {
    handleJobStart(req, res)
  } else if (req.method === 'GET' && req.url?.startsWith('/transcribe-poll/')) {
    handleTranscribePoll(req, res)
  } else if (req.method === 'POST' && req.url === '/info') {
    handleInfo(req, res)
  } else if (req.method === 'GET' && req.url?.startsWith('/serve/')) {
    handleServe(req, res)
  } else if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { status: 'ok', service: 'slicer-youtube-api' })
  } else {
    sendJson(res, 404, { error: 'Not found' })
  }
})

server.listen(PORT, () => {
  cleanupTempArtifacts()
  reconcileInterruptedSqliteJobs().catch((error) => {
    console.error('[job-reconcile] failed:', error.message)
  })
  if (isSqlitePrimaryJobStore() && process.env.SLICER_ENABLE_RETENTION_SWEEPER !== 'false') {
    retentionSweeper.scheduleRetentionSweeps({ runImmediately: true })
  } else {
    console.log('[retention-sweeper] skipped (SLICER_JOB_STORE != sqlite or sweeper disabled)')
  }
  console.log(`\n🎬 Slicer Local API running on http://localhost:${PORT}`)
  console.log(`   POST /download  - Download YouTube/Twitch video`)
  console.log(`   POST /clip      - Export clip segment via FFmpeg`)
  console.log(`   GET  /health    - Health check`)
  console.log(`   Max duration: ${MAX_DURATION_SEC / 60} minutes`)
  console.log(`   Max file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  console.log(`   Supabase: ${SUPABASE_URL ? '✅ configured' : '❌ missing NEXT_PUBLIC_SUPABASE_URL'}`)
  console.log()
})
