/**
 * AI-powered clip detection using OpenAI Whisper + GPT-4o
 * 
 * Flow:
 * 1. Whisper transcribes the video audio → transcript with word-level timestamps
 * 2. GPT-4o analyzes the transcript + user categories → returns best clip timestamps
 * 3. Results used as Shotstack render start times
 */

import OpenAI from 'openai'
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
 * Falls back gracefully if key not set or transcription fails.
 */
async function transcribeVideo(videoUrl: string): Promise<{
  text: string
  segments: { start: number; end: number; text: string }[]
}> {
  console.log('[ai-analysis] transcribing via AssemblyAI...')
  const result = await transcribeUrl(videoUrl, 50000)
  return {
    text: result.text,
    // Convert ms → seconds for consistency with the rest of the pipeline
    segments: result.segments.map(s => ({
      start: s.start / 1000,
      end: s.end / 1000,
      text: s.text,
    })),
  }
}

/**
 * Use GPT-4o to analyze the transcript and pick the best clip timestamps
 * based on the user's selected AI focus categories.
 */
async function analyzeTranscript(
  transcript: { text: string; segments: { start: number; end: number; text: string }[] },
  options: {
    clipDuration: number
    clipCount: number
    aiFocus: AIFocus[]
    videoDurationEstimate?: number
  }
): Promise<AIHighlight[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const { clipDuration, clipCount, aiFocus } = options

  // Build category descriptions for the prompt
  const categoryDescriptions = aiFocus
    .map(f => `- ${f}: ${AI_FOCUS_DESCRIPTIONS[f]}`)
    .join('\n')

  // Format transcript segments for GPT
  const formattedTranscript = transcript.segments
    .map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text}`)
    .join('\n')

  const systemPrompt = `You are an expert video editor specializing in gaming and social media content.
Your job is to analyze video transcripts and identify the best moments to clip for social media virality.
You understand what makes content engaging on TikTok, Twitter, and YouTube Shorts.
Always respond with valid JSON only, no markdown, no explanation outside the JSON.`

  const transcriptSummary = formattedTranscript.length > 0
    ? `Transcript:\n${formattedTranscript}`
    : `Note: No speech detected in the first portion of this video. It may be music, ambient sound, or gameplay without commentary. Use your best judgment to pick ${clipCount} evenly-spaced clips that would likely capture engaging moments based on the selected categories.`

  const lastSegmentTime = transcript.segments.length > 0
    ? transcript.segments[transcript.segments.length - 1].end
    : clipDuration * clipCount * 2

  const userPrompt = `Analyze this video and identify the ${clipCount} best moments to clip for social media.

Each clip should be ${clipDuration} seconds long.
Select moments that match these categories:
${categoryDescriptions}

${transcriptSummary}

Return a JSON object with a "clips" array of exactly ${clipCount} clips. Each clip must have:
- startTime: number (seconds, the best start point for a ${clipDuration}s clip)
- categories: array of category names from [${aiFocus.join(', ')}] that this clip matches
- reason: string (1 sentence explaining why this moment is clip-worthy)
- confidence: number 0-100

Rules:
- Clips must not overlap (leave at least ${clipDuration}s between start times)
- First clip can start at 0
- Spread clips across the video timeline (don't cluster them all at the start)
- Estimated video duration to work with: ~${Math.max(lastSegmentTime * 3, clipDuration * clipCount * 3)} seconds
- Return ONLY valid JSON with a "clips" key

Example: {"clips": [{"startTime": 42.5, "categories": ["hype_moments"], "reason": "High energy action sequence", "confidence": 85}]}`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  })

  const raw = completion.choices[0]?.message?.content || '[]'

  try {
    // GPT returns { clips: [...] } or just [...] depending on mood
    const parsed = JSON.parse(raw)
    const clips: AIHighlight[] = Array.isArray(parsed) ? parsed : (parsed.clips || parsed.moments || Object.values(parsed)[0] || [])

    return clips
      .slice(0, clipCount)
      .map((clip: Partial<AIHighlight>) => ({
        startTime: Number(clip.startTime) || 0,
        endTime: (Number(clip.startTime) || 0) + clipDuration,
        categories: (clip.categories || aiFocus.slice(0, 1)) as AIFocus[],
        reason: clip.reason || 'Selected by AI',
        confidence: Number(clip.confidence) || 75,
      }))
      .sort((a, b) => a.startTime - b.startTime)
  } catch (err) {
    console.error('[ai-analysis] GPT response parse failed:', err, raw)
    return []
  }
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

  if (!process.env.OPENAI_API_KEY && !process.env.ASSEMBLYAI_API_KEY) {
    console.warn('[ai-analysis] No API keys set — using sequential fallback')
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

    console.log('[ai-analysis] analyzing with GPT-4o...')
    const highlights = await analyzeTranscript(transcript, options)
    console.log(`[ai-analysis] GPT returned ${highlights.length} highlights`)

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
