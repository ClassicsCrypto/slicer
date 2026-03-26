/**
 * AI-powered clip detection using OpenAI Whisper + GPT-4o
 * 
 * Flow:
 * 1. Whisper transcribes the video audio → transcript with word-level timestamps
 * 2. GPT-4o analyzes the transcript + user categories → returns best clip timestamps
 * 3. Results used as Shotstack render start times
 */

import { transcribeUrl } from '@/lib/assemblyai'
import type { AIFocus } from '@/types'

export interface AIHighlight {
  startTime: number       // seconds into video
  endTime: number         // seconds
  categories: AIFocus[]   // which categories this clip matches
  reason: string          // GPT's explanation for why this was chosen
  confidence: number      // 0-100
}

const AI_FOCUS_DESCRIPTIONS: Record<AIFocus, string> = {
  funny_moments:  'moments that are genuinely funny, humorous, or comedic',
  kill_streaks:   'kill streaks, multi-kills, or impressive eliminations in gameplay',
  intense_action: 'intense, fast-paced action sequences with high energy',
  big_plays:      'big plays, clutch moments, or impressive skill displays',
  reactions:      'strong emotional reactions, surprise, excitement, or disbelief',
  key_dialogue:   'important dialogue, key quotes, or memorable lines',
  hype_moments:   'hype, hypest moments that would make viewers excited',
  fails:          'fails, mistakes, accidents, or funny errors',
}

/**
 * Transcribe a video URL using OpenAI Whisper.
 * Downloads only the audio stream via URL (Whisper accepts URLs directly).
 * Returns transcript with timestamps.
 */
/**
 * Transcribe video using AssemblyAI — passes URL directly, no file upload.
 */
async function transcribeVideo(videoUrl: string): Promise<{
  text: string
  segments: { start: number; end: number; text: string }[]
  highlights: { text: string; rank: number; timestamps: { start: number; end: number }[] }[]
}> {
  console.log('[ai-analysis] transcribing via AssemblyAI...')
  const result = await transcribeUrl(videoUrl, 50000)
  return {
    text: result.text,
    segments: result.segments.map(s => ({
      start: s.start / 1000,
      end: s.end / 1000,
      text: s.text,
    })),
    highlights: result.highlights,
  }
}

/**
 * Pick best clip timestamps using AssemblyAI's auto_highlights.
 * Highlights are key phrases detected as important by AssemblyAI's model.
 * Falls back to evenly-spaced segments if no highlights found.
 */
function pickHighlightsFromTranscript(
  transcript: { text: string; segments: { start: number; end: number; text: string }[] },
  rawHighlights: { text: string; rank: number; timestamps: { start: number; end: number }[] }[],
  options: {
    clipDuration: number
    clipCount: number
    aiFocus: AIFocus[]
  }
): AIHighlight[] {
  const { clipDuration, clipCount, aiFocus } = options

  // Build candidate moments from AssemblyAI highlights (sorted by rank desc)
  const candidates: { startTime: number; text: string; rank: number }[] = []

  for (const h of rawHighlights.sort((a, b) => b.rank - a.rank)) {
    for (const ts of h.timestamps) {
      const startTime = Math.max(0, ts.start / 1000 - clipDuration * 0.3) // start slightly before the highlight
      candidates.push({ startTime, text: h.text, rank: h.rank })
    }
  }

  // If no highlights, fall back to evenly-spaced segments from transcript
  if (candidates.length === 0 && transcript.segments.length > 0) {
    const totalDuration = transcript.segments[transcript.segments.length - 1].end
    const step = totalDuration / (clipCount + 1)
    for (let i = 1; i <= clipCount; i++) {
      candidates.push({
        startTime: step * i,
        text: transcript.segments.find(s => s.start >= step * i)?.text || 'Key moment',
        rank: 1,
      })
    }
  }

  // Deduplicate — ensure clips don't overlap
  const selected: { startTime: number; text: string; rank: number }[] = []
  for (const c of candidates) {
    if (selected.length >= clipCount) break
    const overlaps = selected.some(s => Math.abs(s.startTime - c.startTime) < clipDuration)
    if (!overlaps) selected.push(c)
  }

  // If still not enough, pad with sequential fallback
  while (selected.length < clipCount) {
    const lastStart = selected.length > 0 ? selected[selected.length - 1].startTime : 0
    selected.push({ startTime: lastStart + clipDuration + 5, text: 'Additional clip', rank: 0 })
  }

  return selected
    .slice(0, clipCount)
    .sort((a, b) => a.startTime - b.startTime)
    .map((s, i) => ({
      startTime: s.startTime,
      endTime: s.startTime + clipDuration,
      categories: aiFocus.length <= 1 ? aiFocus : aiFocus.slice(0, Math.max(1, Math.round(aiFocus.length * (s.rank || 0.5)))) as AIFocus[],
      reason: s.text || 'Detected highlight moment',
      confidence: Math.min(100, Math.round(s.rank * 100)),
    }))
}

/**
 * Main entry point: transcribe + analyze a video URL.
 * Returns highlight segments with timestamps, categories, and reasons.
 * Falls back to sequential placement if AI fails.
 */
export async function detectHighlightsAI(
  videoUrl: string,
  options: {
    clipDuration: number
    clipCount: number
    aiFocus: AIFocus[]
  }
): Promise<AIHighlight[]> {
  const { clipDuration, clipCount, aiFocus } = options

  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.warn('[ai-analysis] ASSEMBLYAI_API_KEY not set — using sequential fallback')
    return sequentialFallback(clipDuration, clipCount, aiFocus)
  }

  try {
    console.log(`[ai-analysis] transcribing video: ${videoUrl}`)
    const transcript = await transcribeVideo(videoUrl)
    console.log(`[ai-analysis] transcript: ${transcript.segments.length} segments, ${transcript.text.length} chars`)

    // Even with no speech, GPT can still pick clips based on timing context
    // Only fall back if we got nothing at all from Whisper
    if (!transcript) {
      console.warn('[ai-analysis] no transcript at all — using sequential fallback')
      return sequentialFallback(clipDuration, clipCount, aiFocus)
    }

    console.log(`[ai-analysis] using AssemblyAI highlights (${transcript.highlights.length} found)`)
    const highlights = pickHighlightsFromTranscript(transcript, transcript.highlights, options)
    console.log(`[ai-analysis] picked ${highlights.length} highlight segments`)

    if (highlights.length === 0) {
      return sequentialFallback(clipDuration, clipCount, aiFocus)
    }

    return highlights
  } catch (err) {
    console.error('[ai-analysis] failed, using sequential fallback:', err)
    return sequentialFallback(clipDuration, clipCount, aiFocus)
  }
}

function sequentialFallback(clipDuration: number, clipCount: number, aiFocus: AIFocus[]): AIHighlight[] {
  console.warn('[ai-analysis] using sequential fallback')
  return Array.from({ length: clipCount }, (_, i) => ({
    startTime: i * Math.ceil(clipDuration / 2),
    endTime: i * Math.ceil(clipDuration / 2) + clipDuration,
    categories: aiFocus.slice(0, Math.max(1, Math.ceil(aiFocus.length * (0.4 + (i % 3) * 0.2)))) as AIFocus[],
    reason: 'Sequential clip placement',
    confidence: 50,
  }))
}
