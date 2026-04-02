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
const { execSync, exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

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
const MAX_DURATION_SEC = 3 * 60 * 60 // 3 hours
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

// Smart cache: videoId → { publicUrl, duration, title, filePath, cachedAt }
const videoCache = new Map()
// Active downloads: downloadId → { status, publicUrl, title, error, progress }
const activeDownloads = new Map()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

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

/**
 * Get video info without downloading
 */
function getVideoInfo(url) {
  try {
    const raw = execSync(
      `yt-dlp --no-download --print "%(duration)s|||%(title)s|||%(id)s" "${url}"`,
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
    const cmd = `yt-dlp -f "bv*[height<=720]+ba/b[height<=720]" --merge-output-format mp4 -o "${outputPath}" "${url}"`
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
      const textCase = subtitleOptions?.textCase || 'original'

      // Filter words that fall within the trimmed window and shift their timestamps
      const trimmedSubs = subtitles
        .map(w => ({ ...w, start: w.start - trimOffset, end: w.end - trimOffset }))
        .filter(w => w.end > 0 && w.start < clipDuration)
      
      const srtContent = generateSRT(trimmedSubs, 0, textCase)
      fs.writeFileSync(srtFile, srtContent, 'utf8')
      console.log(`[clip] generated SRT: ${subtitles.length} words`)
      console.log(`[clip] SRT preview:\n${srtContent.slice(0, 500)}`)

      // Build FFmpeg subtitle style (ASS format)
      // ASS color format: &HAABBGGRR (hex, AA=alpha 00=opaque FF=transparent)
      const opts = subtitleOptions || {}
      const fontSize = opts.size === 'small' ? 18 : opts.size === 'large' ? 32 : 24
      const hexColor = (opts.color || '#ffffff').replace('#', '')
      // Convert RGB hex to ASS BGR format
      const r = hexColor.slice(0, 2), g = hexColor.slice(2, 4), b = hexColor.slice(4, 6)
      const primaryColour = `&H00${b}${g}${r}`  // white = &H00FFFFFF

      // Font selection - 3 MCV-branded options
      // Use local font files bundled with the server
      const fontsDir = path.join(__dirname, 'fonts')
      const fontFileMap = {
        'impact': null,  // Impact is built into Windows
        'bebas': path.join(fontsDir, 'BebasNeue-Regular.ttf'),
        'montserrat': path.join(fontsDir, 'Montserrat-Bold.ttf'),
      }
      const fontNameMap = {
        'impact': 'Impact',
        'bebas': 'Bebas Neue',
        'montserrat': 'Montserrat',
      }
      const fontFile = fontFileMap[opts.font] || null
      const fontName = fontNameMap[opts.font] || 'Impact'

      // Outline thickness
      const outlineThickness = opts.outlineThickness || 'medium'
      const outlineSize = outlineThickness === 'none' ? 0 : outlineThickness === 'thin' ? 1 : outlineThickness === 'thick' ? 3 : 2

      // Outline color
      const outlineHex = (opts.outlineColor || '#000000').replace('#', '')
      const oR = outlineHex.slice(0, 2), oG = outlineHex.slice(2, 4), oB = outlineHex.slice(4, 6)
      const outlineColour = `&H00${oB}${oG}${oR}`

      // Shadow
      const shadowSize = opts.shadow ? 2 : 0

      // BorderStyle=1 = outline+shadow (NO black box)
      const borderStyle = 1

      // Position: bottom with margin, matching the web preview
      const alignment = opts.position === 'top' ? 8 : opts.position === 'center' ? 5 : 2
      const marginV = opts.position === 'top' ? 25 : 30

      // Escape paths for FFmpeg (Windows needs special handling)
      const escapedSrt = srtFile.replace(/\\/g, '/').replace(/:/g, '\\:')
      const fontsDirEscaped = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:')
      const fontsDirOption = fontFile ? `:fontsdir='${fontsDirEscaped}'` : ''
      subtitleFilter = `-vf "subtitles='${escapedSrt}'${fontsDirOption}:force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=${primaryColour},OutlineColour=${outlineColour},BackColour=&H80000000,BorderStyle=${borderStyle},Outline=${outlineSize},Shadow=${shadowSize},Alignment=${alignment},MarginV=${marginV},Bold=1'"` 
    }

    // Aspect ratio crop filter
    let cropFilter = ''
    if (aspectRatio === 'tiktok') {
      // 9:16 vertical - center crop
      cropFilter = 'crop=ih*9/16:ih'
    } else if (aspectRatio === 'youtube_shorts') {
      // 1:1 square - center crop
      cropFilter = 'crop=min(iw\\,ih):min(iw\\,ih)'
    }
    // 'twitter' = 16:9 (usually already native), 'custom' = no crop

    // Combine filters: crop first, then subtitles
    let filterChain = ''
    if (cropFilter && subtitleFilter) {
      // Extract just the -vf content from subtitleFilter and chain with crop
      const vfContent = subtitleFilter.replace('-vf "', '').replace(/"$/, '')
      filterChain = `-vf "${cropFilter},${vfContent}"`
    } else if (cropFilter) {
      filterChain = `-vf "${cropFilter}"`
    } else {
      filterChain = subtitleFilter
    }

    // FFmpeg: seek to start, cut for duration, apply filters, re-encode to MP4
    await new Promise((resolve, reject) => {
      const cmd = `ffmpeg -ss ${startTime} -i "${sourceUrl.split('#')[0]}" -t ${duration} ${filterChain} -c:v libx264 -c:a aac -movflags +faststart -y "${outputFile}"`
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

/**
 * Generate SRT subtitle content from word-level timestamps.
 * Groups words into ~4-word chunks for readable subtitles.
 * Timestamps are relative (0-based for the clip).
 */
function generateSRT(words, clipStartTime = 0, textCase = 'original') {
  const WORDS_PER_LINE = 4
  const chunks = []

  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const group = words.slice(i, i + WORDS_PER_LINE)
    let text = group.map(w => w.text).join(' ')
    if (textCase === 'upper') text = text.toUpperCase()
    else if (textCase === 'title') text = text.replace(/\b\w/g, c => c.toUpperCase())
    const start = group[0].start - clipStartTime
    const end = (group[group.length - 1].end || group[group.length - 1].start + 0.5) - clipStartTime
    chunks.push({ text, start: Math.max(0, start), end: Math.max(0, end) })
  }

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
// Active transcriptions: transcribeId → { status, result, error }
const activeTranscriptions = new Map()

// ─── Local Whisper transcription endpoint ───
async function handleTranscribeLocal(req, res) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  let parsed
  try { parsed = JSON.parse(raw) } catch { return sendJson(res, 400, { error: 'Invalid JSON' }) }

  const { audioUrl, audioPath } = parsed
  if (!audioUrl && !audioPath) return sendJson(res, 400, { error: 'audioUrl or audioPath required' })

  const transcribeId = crypto.randomBytes(8).toString('hex')
  activeTranscriptions.set(transcribeId, { status: 'transcribing', progress: 'Starting Whisper...' })

  console.log(`[transcribe-local] ${transcribeId} starting`)

  // Run in background
  ;(async () => {
    try {
      // Resolve audio file path
      let filePath = audioPath
      if (!filePath && audioUrl) {
        // If it's a local /serve/ URL, resolve to file
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
        activeTranscriptions.set(transcribeId, { status: 'error', error: 'Audio file not found' })
        return
      }

      activeTranscriptions.set(transcribeId, { status: 'transcribing', progress: 'Running Whisper medium model...' })

      const whisperScript = path.join(__dirname, 'whisper-transcribe.py')
      const groqKey = process.env.GROQ_API_KEY || ''
      const cmd = `python "${whisperScript}" "${filePath}" --groq-key "${groqKey}"`
      
      console.log(`[transcribe-local] ${transcribeId} running: ${cmd}`)
      
      exec(cmd, { timeout: 60 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (stderr) console.log(`[transcribe-local] ${transcribeId} stderr:`, stderr.slice(-500))
        
        if (err) {
          console.error(`[transcribe-local] ${transcribeId} error:`, err.message)
          activeTranscriptions.set(transcribeId, { status: 'error', error: `Whisper failed: ${err.message}` })
          return
        }

        try {
          const result = JSON.parse(stdout.trim().split('\n').pop())
          if (result.error) throw new Error(result.error)
          activeTranscriptions.set(transcribeId, { status: 'complete', result })
          console.log(`[transcribe-local] ${transcribeId} complete: ${result.words?.length} words, ${result.duration}s, ${result.realtime_factor}x realtime`)
        } catch (parseErr) {
          activeTranscriptions.set(transcribeId, { status: 'error', error: `Parse error: ${parseErr.message}` })
        }
      })
    } catch (err) {
      console.error(`[transcribe-local] ${transcribeId} error:`, err.message)
      activeTranscriptions.set(transcribeId, { status: 'error', error: err.message })
    }
  })()

  sendJson(res, 200, { transcribeId })
}

function handleTranscribePoll(req, res) {
  const transcribeId = req.url.split('/transcribe-poll/')[1]
  const entry = activeTranscriptions.get(transcribeId)
  if (!entry) return sendJson(res, 404, { error: 'Transcription not found' })

  sendJson(res, 200, entry)

  if (entry.status === 'complete' || entry.status === 'error') {
    setTimeout(() => activeTranscriptions.delete(transcribeId), 5 * 60 * 1000)
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
      activeDownloads.set(downloadId, { status: 'downloading', progress: `${info.title} (${Math.round(info.duration / 60)}min)` })

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
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    const { sourceUrl, timestamp } = body

    if (!sourceUrl) return sendJson(res, 400, { error: 'sourceUrl required' })

    const ts = timestamp || 0
    const thumbId = crypto.randomBytes(6).toString('hex')
    const thumbFile = path.join(TEMP_DIR, `thumb-${thumbId}.jpg`)

    // If source is a local /serve/ URL, resolve to local file
    let inputPath = sourceUrl
    if (sourceUrl.includes('/serve/')) {
      const fileName = sourceUrl.split('/serve/').pop()
      const localPath = path.join(TEMP_DIR, decodeURIComponent(fileName))
      if (fs.existsSync(localPath)) inputPath = localPath
    }

    const cmd = `ffmpeg -ss ${ts} -i "${inputPath}" -vframes 1 -q:v 2 -y "${thumbFile}"`
    console.log(`[thumb] extracting frame at ${ts}s`)

    execSync(cmd, { timeout: 15000 })

    if (!fs.existsSync(thumbFile)) {
      return sendJson(res, 500, { error: 'Failed to extract frame' })
    }

    const stat = fs.statSync(thumbFile)
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
    })
    const stream = fs.createReadStream(thumbFile)
    stream.pipe(res)
    stream.on('end', () => {
      try { fs.unlinkSync(thumbFile) } catch {}
    })
  } catch (err) {
    console.error('[thumb] Error:', err.message)
    sendJson(res, 500, { error: 'Thumbnail extraction failed' })
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
  } else if (req.method === 'POST' && req.url === '/thumbnail') {
    handleThumbnail(req, res)
  } else if (req.method === 'POST' && req.url === '/transcribe-local') {
    handleTranscribeLocal(req, res)
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
  console.log(`\n🎬 Slicer Local API running on http://localhost:${PORT}`)
  console.log(`   POST /download  - Download YouTube/Twitch video`)
  console.log(`   POST /clip      - Export clip segment via FFmpeg`)
  console.log(`   GET  /health    - Health check`)
  console.log(`   Max duration: ${MAX_DURATION_SEC / 60} minutes`)
  console.log(`   Max file size: ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  console.log(`   Supabase: ${SUPABASE_URL ? '✅ configured' : '❌ missing NEXT_PUBLIC_SUPABASE_URL'}`)
  console.log()
})
