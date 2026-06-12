/**
 * Audio Energy Analysis for Slicer
 * Uses FFmpeg to extract volume levels per segment.
 * Returns an array of { time, energy } objects.
 */

const { spawn } = require('child_process')

// Bounded concurrency for ALL media-tool child processes (shared with
// youtube-api.js frame analysis via the runMediaToolLimited export).
// Keeps heavy ffmpeg fleets from starving the box while never blocking
// the event loop the way spawnSync did.
const MEDIA_TOOL_CONCURRENCY = 3
let activeMediaTools = 0
const mediaToolQueue = []

function acquireMediaToolSlot() {
  return new Promise((resolve) => {
    if (activeMediaTools < MEDIA_TOOL_CONCURRENCY) {
      activeMediaTools += 1
      resolve()
    } else {
      mediaToolQueue.push(resolve)
    }
  })
}

function releaseMediaToolSlot() {
  const next = mediaToolQueue.shift()
  if (next) next()
  else activeMediaTools -= 1
}

function runMediaTool(command, args, timeout) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      reject(new Error(`${command} timed out after ${timeout}ms`))
    }, timeout)

    proc.stdout.on('data', (chunk) => { stdout += chunk })
    proc.stderr.on('data', (chunk) => { stderr += chunk })

    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    proc.on('close', (status) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (typeof status === 'number' && status !== 0) {
        const detail = `${stderr || stdout}`.trim()
        reject(new Error(detail || `${command} exited with status ${status}`))
      } else {
        resolve(`${stdout}${stderr}`)
      }
    })
  })
}

async function runMediaToolLimited(command, args, timeout) {
  await acquireMediaToolSlot()
  try {
    return await runMediaTool(command, args, timeout)
  } finally {
    releaseMediaToolSlot()
  }
}

/**
 * Get audio volume levels per segment using FFmpeg's volumedetect + astats
 * @param {string} filePath - Path to video/audio file
 * @param {number} segmentSec - Segment duration in seconds (default 10)
 * @returns {Promise<Array<{startSec: number, endSec: number, meanVolume: number, maxVolume: number}>>}
 */
async function analyzeAudioEnergy(filePath, segmentSec = 10) {
  try {
    // Get duration first
    const durationStr = (await runMediaToolLimited('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ], 15000)).trim()
    const duration = parseFloat(durationStr) || 0
    if (duration <= 0) return []

    const numSegments = Math.ceil(duration / segmentSec)

    // Sample segments (don't analyze every single one for very long videos)
    const maxSegments = 200
    const step = Math.max(1, Math.floor(numSegments / maxSegments))

    const tasks = []
    for (let i = 0; i < numSegments; i += step) {
      const startSec = i * segmentSec
      const segDuration = Math.min(segmentSec, duration - startSec)
      if (segDuration < 1) continue

      tasks.push((async () => {
        try {
          const result = await runMediaToolLimited('ffmpeg', [
            '-ss', String(startSec),
            '-t', String(segDuration),
            '-i', filePath,
            '-af', 'volumedetect',
            '-f', 'null',
            '-',
          ], 10000)

          // Parse mean_volume and max_volume from output
          const meanMatch = result.match(/mean_volume:\s*([-\d.]+)\s*dB/)
          const maxMatch = result.match(/max_volume:\s*([-\d.]+)\s*dB/)

          const meanVolume = meanMatch ? parseFloat(meanMatch[1]) : -100
          const maxVolume = maxMatch ? parseFloat(maxMatch[1]) : -100

          return {
            startSec,
            endSec: startSec + segDuration,
            meanVolume,
            maxVolume,
          }
        } catch {
          // Skip failed segments
          return null
        }
      })())
    }

    const segments = (await Promise.all(tasks)).filter(Boolean)
    return segments
  } catch (err) {
    console.error('[audio-energy] Error:', err.message)
    return []
  }
}

/**
 * Find volume spikes (loud moments) relative to the average
 * @param {Array} segments - Output from analyzeAudioEnergy
 * @param {number} threshold - How many dB above mean to count as a spike (default 6)
 * @returns {Array<{startSec: number, endSec: number, spikeLevel: number}>}
 */
function findVolumeSpikes(segments, threshold = 6) {
  if (segments.length === 0) return []

  // Calculate average volume (ignoring very quiet segments)
  const activeSegments = segments.filter(s => s.meanVolume > -60)
  if (activeSegments.length === 0) return []

  const avgMean = activeSegments.reduce((sum, s) => sum + s.meanVolume, 0) / activeSegments.length

  // Find segments significantly louder than average
  return segments
    .filter(s => s.maxVolume > avgMean + threshold || s.meanVolume > avgMean + threshold / 2)
    .map(s => ({
      startSec: s.startSec,
      endSec: s.endSec,
      spikeLevel: Math.round(s.maxVolume - avgMean), // dB above average
    }))
    .sort((a, b) => b.spikeLevel - a.spikeLevel)
}

module.exports = { analyzeAudioEnergy, findVolumeSpikes, runMediaToolLimited }
