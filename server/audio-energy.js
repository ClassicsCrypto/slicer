/**
 * Audio Energy Analysis for Slicer
 * Uses FFmpeg to extract volume levels per segment.
 * Returns an array of { time, energy } objects.
 */

const { spawnSync } = require('child_process')

function runMediaTool(command, args, timeout) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
  })

  if (result.error) throw result.error
  if (typeof result.status === 'number' && result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(detail || `${command} exited with status ${result.status}`)
  }

  return `${result.stdout || ''}${result.stderr || ''}`
}

/**
 * Get audio volume levels per segment using FFmpeg's volumedetect + astats
 * @param {string} filePath - Path to video/audio file
 * @param {number} segmentSec - Segment duration in seconds (default 10)
 * @returns {Array<{startSec: number, endSec: number, meanVolume: number, maxVolume: number}>}
 */
function analyzeAudioEnergy(filePath, segmentSec = 10) {
  try {
    // Get duration first
    const durationStr = runMediaTool('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'csv=p=0',
      filePath,
    ], 15000).trim()
    const duration = parseFloat(durationStr) || 0
    if (duration <= 0) return []

    const segments = []
    const numSegments = Math.ceil(duration / segmentSec)

    // Sample segments (don't analyze every single one for very long videos)
    const maxSegments = 200
    const step = Math.max(1, Math.floor(numSegments / maxSegments))

    for (let i = 0; i < numSegments; i += step) {
      const startSec = i * segmentSec
      const segDuration = Math.min(segmentSec, duration - startSec)
      if (segDuration < 1) continue

      try {
        const result = runMediaTool('ffmpeg', [
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

        segments.push({
          startSec,
          endSec: startSec + segDuration,
          meanVolume,
          maxVolume,
        })
      } catch {
        // Skip failed segments
      }
    }

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

module.exports = { analyzeAudioEnergy, findVolumeSpikes }
