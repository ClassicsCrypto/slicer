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
 *   - Max 15 minutes video duration
 *   - Max 100MB file size
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
const MAX_DURATION_SEC = 15 * 60 // 15 minutes
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

// Ensure temp dir exists
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

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

    exec(cmd, { timeout: 180000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[yt-dlp] error:', stderr)
        reject(new Error(`Download failed: ${stderr || err.message}`))
        return
      }
      console.log('[yt-dlp] done:', stdout.trim())
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

    // 3. Upload to Supabase
    const fileExt = path.extname(files[0]) || '.webm'
    const fileName = `${fileId}-${info.id}${fileExt}`
    const publicUrl = await uploadToSupabase(outputFile, fileName)
    console.log(`[download] uploaded: ${publicUrl}`)

    // 4. Cleanup temp file
    fs.unlinkSync(outputFile)

    // 5. Return public URL
    sendJson(res, 200, {
      publicUrl,
      duration: info.duration,
      title: info.title,
      videoId: info.id,
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

  const { sourceUrl, startTime, endTime, title, subtitles, subtitleOptions } = parsed
  if (!sourceUrl || startTime == null || endTime == null) {
    return sendJson(res, 400, { error: 'sourceUrl, startTime, endTime required' })
  }

  const duration = endTime - startTime
  if (duration < 1 || duration > 300) {
    return sendJson(res, 400, { error: 'Clip must be 1-300 seconds' })
  }

  console.log(`\n[clip] request: ${startTime}s → ${endTime}s (${duration}s) from ${sourceUrl.slice(0, 80)}...`)
  console.log(`[clip] subtitles: ${subtitles ? subtitles.length + ' words' : 'NONE'}`)
  console.log(`[clip] subtitleOptions:`, JSON.stringify(subtitleOptions || {}))

  const fileId = crypto.randomBytes(8).toString('hex')
  const outputFile = path.join(TEMP_DIR, `${fileId}-clip.mp4`)
  const srtFile = path.join(TEMP_DIR, `${fileId}.srt`)

  try {
    // Generate SRT subtitle file if subtitles provided
    let subtitleFilter = ''
    if (subtitles && subtitles.length > 0 && subtitleOptions?.enabled !== false) {
      // Subtitle timestamps are already relative to clip start (0-based)
      const srtContent = generateSRT(subtitles, 0)
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

      // BorderStyle=1 = outline+shadow (NO black box), BorderStyle=3 = opaque box
      const borderStyle = 1
      const outlineSize = 2
      const shadowSize = 1

      // Position: bottom with margin, matching the web preview
      const alignment = opts.position === 'top' ? 8 : opts.position === 'center' ? 5 : 2
      const marginV = opts.position === 'top' ? 25 : 30

      // Escape paths for FFmpeg (Windows needs special handling)
      const escapedSrt = srtFile.replace(/\\/g, '/').replace(/:/g, '\\:')
      const fontsDirEscaped = fontsDir.replace(/\\/g, '/').replace(/:/g, '\\:')
      const fontsDirOption = fontFile ? `:fontsdir='${fontsDirEscaped}'` : ''
      subtitleFilter = `-vf "subtitles='${escapedSrt}'${fontsDirOption}:force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=${primaryColour},OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=${borderStyle},Outline=${outlineSize},Shadow=${shadowSize},Alignment=${alignment},MarginV=${marginV},Bold=1'"` 
    }

    // FFmpeg: seek to start, cut for duration, burn subtitles, re-encode to MP4
    await new Promise((resolve, reject) => {
      const cmd = `ffmpeg -ss ${startTime} -i "${sourceUrl.split('#')[0]}" -t ${duration} ${subtitleFilter} -c:v libx264 -c:a aac -movflags +faststart -y "${outputFile}"`
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
function generateSRT(words, clipStartTime = 0) {
  const WORDS_PER_LINE = 4
  const chunks = []

  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const group = words.slice(i, i + WORDS_PER_LINE)
    const text = group.map(w => w.text).join(' ')
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
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    return res.end()
  }

  if (req.method === 'POST' && req.url === '/download') {
    handleDownload(req, res)
  } else if (req.method === 'POST' && req.url === '/clip') {
    handleClip(req, res)
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
