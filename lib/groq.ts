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

  const highlights = transcript.auto_highlights_result?.results
    .slice(0, 20)
    .map(h => `"${h.text}" (rank ${h.rank.toFixed(2)}, at ${h.timestamps.map(t => `${(t.start / 1000).toFixed(1)}s`).join(', ')})`)
    .join('\n') ?? ''

  const focusStr = aiFocus.join(', ')

  return `You are an expert video clip selector for a gaming/streaming content team.

Given the following video transcript analysis, identify the top ${clipCount} moments that would make great ~${clipLength}-second social media clips. Focus especially on: ${focusStr}.

CHAPTERS:
${segments || 'No chapters available'}

KEY HIGHLIGHTS:
${highlights || 'No highlights available'}

FULL TRANSCRIPT EXCERPT:
${(transcript.text ?? '').slice(0, 2000)}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "moments": [
    {
      "start_time": <number in seconds>,
      "end_time": <number in seconds>,
      "virality_score": <1-10>,
      "matched_categories": [<array of category strings from: funny_moments, kill_streaks, intense_action, big_plays, reactions, key_dialogue, hype_moments, fails>],
      "ai_reason": "<1-2 sentence explanation>"
    }
  ]
}

Rules:
- Each clip should be approximately ${clipLength} seconds (end_time - start_time ≈ ${clipLength})
- Clips must not overlap
- Virality score: 10 = viral gold, 1 = boring
- Only include categories from the focus list that genuinely apply: ${focusStr}
- Return exactly ${clipCount} moments`
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
      temperature: 0.3,
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
