import { AIFocus } from '@/types'
import { AssemblyAIResult } from './assemblyai'
import { ScoredMoment } from './groq'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
const MODEL = process.env.OPENROUTER_CLIP_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b:free'

function buildPrompt(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
): string {
  const chapters = transcript.chapters?.map((ch, i) =>
    `[${i}] ${(ch.start / 1000).toFixed(1)}s-${(ch.end / 1000).toFixed(1)}s: ${ch.headline} — ${ch.summary}`
  ).join('\n') ?? ''

  const highlights = (transcript.auto_highlights_result?.results ?? [])
    .map(h => `"${h.text}" (rank ${h.rank.toFixed(2)}, at ${h.timestamps.map(t => `${(t.start / 1000).toFixed(1)}s-${(t.end / 1000).toFixed(1)}s`).join(', ')})`)
    .join('\n')

  const wordTimeline = (transcript.words ?? [])
    .filter((_, i) => i % 8 === 0)
    .map(w => `[${(w.start / 1000).toFixed(1)}s] ${w.text}`)
    .join(' ')

  const fullTranscript = (transcript.text ?? '').slice(0, 250_000)
  const focusStr = aiFocus.length ? aiFocus.join(', ') : 'hype_moments, intense_action, big_plays, funny_moments'

  return `You are an expert gaming and livestream clip producer. Pick the best social clips from a long stream transcript.

Goal: Return the top ${clipCount} non-overlapping clips, each about ${clipLength} seconds long.
Focus categories: ${focusStr}

Use the full transcript, chapter summaries, high-ranked transcript highlights, and sparse word timeline. Prefer moments with clear energy: clutch plays, emotional reactions, funny failures, high-stakes commentary, tension build-up, creator reactions, or clean story beats.

Avoid dead air, menus, setup chatter, repeated filler, and moments that require too much missing visual context.

CHAPTERS:
${chapters || 'No chapters available'}

ASSEMBLYAI HIGHLIGHTS:
${highlights || 'No highlights available'}

SPARSE WORD TIMELINE:
${wordTimeline.slice(0, 80_000) || 'No word timeline available'}

FULL TRANSCRIPT:
${fullTranscript || 'No transcript text available'}

Return ONLY valid JSON, no markdown:
{
  "moments": [
    {
      "start_time": 123.4,
      "end_time": 153.4,
      "virality_score": 8,
      "matched_categories": ["hype_moments"],
      "ai_reason": "Why this is a strong clip in 1 sentence."
    }
  ]
}

Rules:
- Return exactly ${clipCount} moments if possible.
- Each clip should be close to ${clipLength} seconds.
- Clips must not overlap; leave at least 2 seconds between clips.
- matched_categories must only use: funny_moments, kill_streaks, intense_action, big_plays, reactions, key_dialogue, hype_moments, fails.
- Use seconds, not milliseconds.
- Prefer precise start times slightly before the key line/reaction so the clip has context.`
}

export async function scoreTranscriptWithOpenRouter(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
): Promise<ScoredMoment[]> {
  if (!OPENROUTER_API_KEY) {
    console.warn('[openrouter] OPENROUTER_API_KEY missing; skipping OpenRouter scorer')
    return []
  }

  const prompt = buildPrompt(transcript, aiFocus, clipCount, clipLength)

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://slicer-one.vercel.app',
      'X-Title': 'Slicer',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.25,
      max_tokens: 4000,
    }),
  })

  if (!res.ok) {
    console.error('[openrouter] API error:', res.status, await res.text())
    return []
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''

  try {
    const parsed = JSON.parse(content)
    return (parsed.moments ?? []) as ScoredMoment[]
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[openrouter] Failed to parse response:', content)
      return []
    }

    try {
      const parsed = JSON.parse(match[0])
      return (parsed.moments ?? []) as ScoredMoment[]
    } catch {
      console.error('[openrouter] Failed to parse extracted JSON:', content)
      return []
    }
  }
}
