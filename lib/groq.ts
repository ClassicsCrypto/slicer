import { AIFocus } from '@/types'
import { AssemblyAIResult } from './assemblyai'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const MODEL = 'llama-3.3-70b-versatile'

export interface ScoredMoment {
  start_time: number // seconds
  end_time: number   // seconds
  virality_score: number
  matched_categories: AIFocus[]
  ai_reason: string
}

function buildPrompt(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
): string {
  const segments = transcript.chapters?.map((ch, i) =>
    `[${i}] ${(ch.start / 1000).toFixed(1)}s–${(ch.end / 1000).toFixed(1)}s: ${ch.headline} — ${ch.summary}`
  ).join('\n') ?? ''

  const highlights = (transcript.auto_highlights_result?.results ?? [])
    .slice(0, 20)
    .map(h => `"${h.text}" (rank ${h.rank.toFixed(2)}, at ${h.timestamps.map(t => `${(t.start / 1000).toFixed(1)}s`).join(', ')})`)
    .join('\n')

  const focusStr = aiFocus.join(', ')

  const totalDuration = transcript.chapters?.length 
    ? Math.max(...transcript.chapters.map(ch => ch.end / 1000))
    : 0

  // Calculate max possible non-overlapping clips
  const maxPossible = totalDuration > 0 
    ? Math.floor(totalDuration / clipLength)
    : clipCount
  const safeClipCount = Math.min(clipCount, Math.max(1, maxPossible))

  return `You are an expert gaming/streaming clip selector for social media. You understand what makes gaming content go viral: clutch plays, emotional reactions, unexpected moments, and high-energy commentary.

CONTEXT: Analyze this video transcript to find the top ${safeClipCount} moments for ~${clipLength}-second clips.
FOCUS: ${focusStr}

CHAPTERS:
${segments || 'No chapters available'}

KEY HIGHLIGHTS:
${highlights || 'No highlights available'}

TRANSCRIPT:
${(transcript.text ?? '').slice(0, 3000)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "moments": [
    {
      "start_time": <seconds>,
      "end_time": <seconds>,
      "virality_score": <1-10>,
      "matched_categories": [<from: funny_moments, kill_streaks, intense_action, big_plays, reactions, key_dialogue, hype_moments, fails>],
      "ai_reason": "<1-2 sentence explanation>"
    }
  ]
}

VIRALITY SCORING:
- 10: Once-in-a-lifetime moment. Clutch 1vX, insane RNG, streamer loses it. Guaranteed viral.
- 8-9: Incredible play or hilarious reaction. Would get shared widely.
- 6-7: Solid highlight. Good energy, clear action, worth posting.
- 4-5: Decent moment but nothing special. Filler content.
- 1-3: Boring, dead air, loading screen, or irrelevant chatter.

GAMING CLIP RULES:
- Each clip ≈ ${clipLength} seconds (end_time - start_time)
- Clips MUST NOT overlap — leave at least 2 seconds gap between clips
- Skip dead air, loading screens, menu navigation, and AFK moments
- Prioritize moments with voice reactions, laughter, shouting, or crowd energy
- If multiple people are talking excitedly, that's usually a good clip
- Commentary that tells a story or builds tension is valuable
- Only include categories that genuinely apply from: ${focusStr}
- Return exactly ${safeClipCount} moments${safeClipCount < clipCount ? ` (video is too short for ${clipCount} non-overlapping ${clipLength}s clips)` : ''}`
}

export async function scoreTranscriptWithGroq(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
): Promise<ScoredMoment[]> {
  if (!GROQ_API_KEY) {
    return fallbackFromHighlights(transcript, aiFocus, clipCount, clipLength)
  }

  const prompt = buildPrompt(transcript, aiFocus, clipCount, clipLength)

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 2000,
    }),
  })

  if (!res.ok) {
    console.error('Groq API error:', res.status, await res.text())
    return fallbackFromHighlights(transcript, aiFocus, clipCount, clipLength)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''

  try {
    const parsed = JSON.parse(content)
    return (parsed.moments ?? []) as ScoredMoment[]
  } catch {
    // Try to extract JSON from the response
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return (parsed.moments ?? []) as ScoredMoment[]
      } catch {
        console.error('Failed to parse Groq response:', content)
      }
    }
    return fallbackFromHighlights(transcript, aiFocus, clipCount, clipLength)
  }
}

function fallbackFromHighlights(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
): ScoredMoment[] {
  const moments: ScoredMoment[] = []

  // Use chapters first
  const chapters = transcript.chapters ?? []
  for (const ch of chapters.slice(0, clipCount)) {
    const startSec = ch.start / 1000
    const endSec = Math.min(startSec + clipLength, ch.end / 1000)
    moments.push({
      start_time: startSec,
      end_time: endSec,
      virality_score: 7,
      matched_categories: aiFocus.slice(0, 2),
      ai_reason: ch.headline,
    })
  }

  // Fill remaining from highlights
  const highlights = transcript.auto_highlights_result?.results ?? []
  for (const h of highlights) {
    if (moments.length >= clipCount) break
    const ts = h.timestamps[0]
    if (!ts) continue
    const startSec = ts.start / 1000
    moments.push({
      start_time: startSec,
      end_time: startSec + clipLength,
      virality_score: Math.round(h.rank * 10),
      matched_categories: aiFocus.slice(0, 1),
      ai_reason: `Highlighted moment: "${h.text}"`,
    })
  }

  return moments.slice(0, clipCount)
}
