/**
 * Audio peak detection using ffmpeg
 * Analyzes a video URL for loud moments → returns ranked highlight timestamps
 */

import { spawn } from 'child_process'
import ffmpegStatic from 'ffmpeg-static'
import type { AIFocus } from '@/types'

export interface HighlightSegment {
  startTime: number   // seconds into the video
  endTime: number     // seconds
  score: number       // 0-100, loudness score
  categories: AIFocus[]
}

/**
 * Analyze audio from a public video URL.
 * Uses ffmpeg to extract per-second RMS loudness without downloading the full video.
 * Returns top N highlight segments based on loudness peaks.
 *
 * Max video duration: 3600s (1 hour)
 */
export async function detectHighlights(
  videoUrl: string,
  options: {
    clipDuration: number        // seconds per clip
    clipCount: number           // how many clips to return
    aiFocus: AIFocus[]          // which categories to label
    maxDuration?: number        // cap analysis at N seconds (default 3600)
  }
): Promise<HighlightSegment[]> {
  const { clipDuration, clipCount, aiFocus, maxDuration = 3600 } = options

  // Get loudness data from ffmpeg
  const loudnessData = await extractLoudness(videoUrl, maxDuration)

  if (loudnessData.length === 0) {
    // Fallback to sequential if analysis fails
    return sequentialFallback(clipDuration, clipCount, aiFocus)
  }

  // Find peaks — local maxima above mean+stddev threshold
  const peaks = findPeaks(loudnessData, clipDuration)

  if (peaks.length === 0) {
    return sequentialFallback(clipDuration, clipCount, aiFocus)
  }

  // Score and rank peaks
  const maxScore = Math.max(...peaks.map(p => p.score))
  const ranked = peaks
    .map(p => ({ ...p, score: Math.round((p.score / maxScore) * 100) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, clipCount)
    // Sort by time so clips are in chronological order
    .sort((a, b) => a.startTime - b.startTime)

  // Assign categories — higher score peaks get more categories
  return ranked.map((peak, i) => ({
    startTime: peak.startTime,
    endTime: peak.startTime + clipDuration,
    score: peak.score,
    categories: assignCategories(aiFocus, peak.score, i),
  }))
}

/**
 * Run ffmpeg to extract per-second loudness (RMS in dB) from video URL.
 * Uses -af astats to get audio stats without decoding video.
 */
function extractLoudness(videoUrl: string, maxDuration: number): Promise<{ time: number; rms: number }[]> {
  return new Promise((resolve) => {
    const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg'

    const args = [
      '-i', videoUrl,
      '-t', String(maxDuration),
      '-vn',                         // skip video decode
      '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
      '-f', 'null',
      '-'
    ]

    const proc = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let output = ''
    proc.stdout.on('data', (d: Buffer) => { output += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { output += d.toString() })

    const timeout = setTimeout(() => {
      proc.kill()
      console.error('[audio-analysis] ffmpeg timed out')
      resolve([])
    }, 55000) // 55s — leave buffer before Vercel 60s limit

    proc.on('close', () => {
      clearTimeout(timeout)
      resolve(parseLoudnessOutput(output))
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      console.error('[audio-analysis] ffmpeg spawn error:', err)
      resolve([])
    })
  })
}

/**
 * Parse ffmpeg ametadata output into time→RMS pairs.
 * Lines look like:
 *   frame:42   pts:42000   pts_time:42.000
 *   lavfi.astats.Overall.RMS_level=-18.3
 */
function parseLoudnessOutput(output: string): { time: number; rms: number }[] {
  const result: { time: number; rms: number }[] = []
  const lines = output.split('\n')

  let currentTime = 0

  for (const line of lines) {
    const timeMatch = line.match(/pts_time:([\d.]+)/)
    if (timeMatch) {
      currentTime = parseFloat(timeMatch[1])
      continue
    }

    const rmsMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=([-\d.]+)/)
    if (rmsMatch) {
      const rms = parseFloat(rmsMatch[1])
      if (!isNaN(rms) && rms > -100) {  // -100 = silence
        result.push({ time: currentTime, rms })
      }
    }
  }

  return result
}

/**
 * Find local loudness peaks, ensuring clips don't overlap.
 * A peak is a window where loudness is above the threshold
 * and is the maximum in its neighborhood.
 */
function findPeaks(
  data: { time: number; rms: number }[],
  clipDuration: number
): { startTime: number; score: number }[] {
  if (data.length === 0) return []

  // Calculate stats
  const rmsValues = data.map(d => d.rms)
  const mean = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length
  const variance = rmsValues.reduce((a, b) => a + (b - mean) ** 2, 0) / rmsValues.length
  const stddev = Math.sqrt(variance)
  const threshold = mean + stddev * 0.5  // above average + half stddev

  const peaks: { startTime: number; score: number }[] = []
  let lastPeakEnd = -clipDuration  // ensure first peak is valid

  // Slide a window of clipDuration across the data
  const windowSize = Math.max(1, Math.round(clipDuration))

  for (let i = 0; i < data.length - windowSize; i++) {
    const window = data.slice(i, i + windowSize)
    const windowMean = window.reduce((a, b) => a + b.rms, 0) / window.length

    if (windowMean > threshold) {
      const startTime = data[i].time

      // Enforce minimum gap between clips (no overlap)
      if (startTime >= lastPeakEnd + clipDuration * 0.5) {
        peaks.push({ startTime, score: windowMean - mean })
        lastPeakEnd = startTime + clipDuration
        // Skip ahead to avoid overlapping windows for same peak
        i += Math.floor(windowSize * 0.5)
      }
    }
  }

  return peaks
}

/**
 * Assign AI focus categories to a clip based on its loudness score.
 * Higher scoring clips get more categories.
 */
function assignCategories(aiFocus: AIFocus[], score: number, index: number): AIFocus[] {
  if (!aiFocus || aiFocus.length === 0) return []
  if (aiFocus.length === 1) return aiFocus

  // Top scoring clips get more categories
  const count = score >= 80 ? aiFocus.length : score >= 50 ? Math.ceil(aiFocus.length * 0.6) : Math.max(1, Math.floor(aiFocus.length * 0.3))

  // Rotate category assignment across clips so not all clips show the same tags
  const rotated = [...aiFocus.slice(index % aiFocus.length), ...aiFocus.slice(0, index % aiFocus.length)]
  return rotated.slice(0, count)
}

/**
 * Fallback: evenly spaced clips if audio analysis fails or returns nothing.
 */
function sequentialFallback(clipDuration: number, clipCount: number, aiFocus: AIFocus[]): HighlightSegment[] {
  console.warn('[audio-analysis] falling back to sequential clip placement')
  return Array.from({ length: clipCount }, (_, i) => ({
    startTime: i * Math.ceil(clipDuration / 2),
    endTime: i * Math.ceil(clipDuration / 2) + clipDuration,
    score: 50,
    categories: assignCategories(aiFocus, 50, i),
  }))
}
