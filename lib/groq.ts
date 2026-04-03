import { AIFocus } from '@/types'
import { AssemblyAIResult } from './assemblyai'
import { v4 as uuidv4 } from 'uuid'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const MODEL = 'llama-3.3-70b-versatile'

// Hype phrases for candidate detection
const HYPE_PHRASES = [
  'let\'s go', 'oh my god', 'no way', 'what the', 'holy', 'insane',
  'clutch', 'got em', 'got him', 'headshot', 'killed', 'dead',
  'eliminated', 'wiped', 'we won', 'gg', 'ace',
  'oh shit', 'dude', 'bro', 'bruh', 'haha', 'lmao',
  'im dead', 'i\'m dead', 'no no no', 'stop', 'why',
  'bro what', 'nooo', 'are you serious', 'come on', 'crazy',
  'how', 'nice', 'beautiful', 'clean', 'nasty',
]

export interface ScoredMoment {
  start_time: number // seconds
  end_time: number   // seconds
  virality_score: number
  matched_categories: AIFocus[]
  ai_reason: string
}

/**
 * Dense transcript sampling with energy indicators.
 */
function sampleTranscript(text: string, words: Array<{ start: number; end: number; text: string }>, maxChars = 10000): string {
  if (!words || words.length === 0) {
    if (text.length <= maxChars) return text
    const third = Math.floor(maxChars / 3)
    return `[START] ${text.slice(0, third)}\n\n[MIDDLE] ${text.slice(Math.floor(text.length / 2) - third / 2, Math.floor(text.length / 2) + third / 2)}\n\n[END] ${text.slice(-third)}`
  }

  const segmentDuration = 30000 // 30s segments
  const totalMs = words[words.length - 1].end
  const allSegments: Array<{ time: string; text: string; energy: number; startMs: number }> = []

  for (let segStart = 0; segStart < totalMs; segStart += segmentDuration) {
    const segEnd = segStart + segmentDuration
    const segWords = words.filter(w => w.start >= segStart && w.start < segEnd)
    if (segWords.length < 3) continue

    const segText = segWords.map(w => {
      const t = (w.text || '').trim()
      if (t.startsWith('[') || t.startsWith('(')) return ''
      return t
    }).filter(Boolean).join(' ')
    
    if (segText.length < 20) continue
    
    const durationSec = (segEnd - segStart) / 1000
    const energy = segWords.length / durationSec
    
    const timeLabel = `[${Math.floor(segStart / 60000)}:${String(Math.floor((segStart % 60000) / 1000)).padStart(2, '0')}]`
    allSegments.push({ time: timeLabel, text: segText, energy, startMs: segStart })
  }
  
  // Sort by energy (highest first) to prioritize interesting parts
  const sorted = [...allSegments].sort((a, b) => b.energy - a.energy)
  
  // Take top 15 high-energy segments + 10 evenly spaced for coverage
  const highEnergy = sorted.slice(0, 15)
  const step = Math.max(1, Math.floor(allSegments.length / 10))
  const evenlySpaced = allSegments.filter((_, i) => i % step === 0).slice(0, 10)
  
  // Merge, dedupe, sort by time
  const selected = new Map<number, typeof allSegments[0]>()
  for (const s of [...highEnergy, ...evenlySpaced]) {
    if (!selected.has(s.startMs)) selected.set(s.startMs, s)
  }
  const final = Array.from(selected.values()).sort((a, b) => a.startMs - b.startMs)
  
  const lines: string[] = []
  let totalCharsUsed = 0
  for (const seg of final) {
    if (totalCharsUsed >= maxChars) break
    const energyTag = seg.energy > 3 ? ' 🔥HIGH ENERGY' : seg.energy > 2 ? ' ⚡ACTIVE' : ''
    const line = `${seg.time}${energyTag} ${seg.text}`
    lines.push(line)
    totalCharsUsed += line.length
  }
  
  return lines.join('\n\n')
}

function buildPrompt(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
  extraContext?: {
    volumeSpikes?: Array<{ startSec: number; spikeLevel: number }>
    hypeMoments?: Array<{ startSec: number; phrases: string[]; count: number }>
    detectionMode?: string
  },
): string {
  const words = transcript.words ?? []
  const segments = transcript.chapters?.map((ch, i) =>
    `[${i}] ${(ch.start / 1000).toFixed(1)}s–${(ch.end / 1000).toFixed(1)}s: ${ch.headline} — ${ch.summary}`
  ).join('\n') ?? ''

  const highlights = (transcript.auto_highlights_result?.results ?? [])
    .slice(0, 20)
    .map(h => `"${h.text}" (rank ${h.rank.toFixed(2)}, at ${h.timestamps.map(t => `${(t.start / 1000).toFixed(1)}s`).join(', ')})`)
    .join('\n')

  const focusStr = aiFocus.join(', ')
  const videoDurationMin = words.length > 0 ? Math.round(words[words.length - 1].end / 60000) : 0

  const totalDuration = transcript.chapters?.length 
    ? Math.max(...transcript.chapters.map(ch => ch.end / 1000))
    : (words.length > 0 ? words[words.length - 1].end / 1000 : 0)

  const maxPossible = totalDuration > 0 
    ? Math.floor(totalDuration / clipLength)
    : clipCount
  const safeClipCount = Math.min(clipCount, Math.max(1, maxPossible))

  const mode = extraContext?.detectionMode || 'default'
  
  const modeInstructions: Record<string, string> = {
    default: `You are an expert clip selector. Find the most VIRAL and engaging moments.`,
    gaming: `You are a gaming clip expert. Find GAMEPLAY highlights.
PRIORITIZE: Kill shots, victory moments, clutch plays, close calls, squad wipes.
Look for phrases like: "got em", "headshot", "let's go", "clutch", "we won", "killed", "dead".
IGNORE: calm discussion, tutorials, menu navigation. Focus on ACTION.`,
    funny: `You are hunting for the FUNNIEST moments in this video.
PRIORITIZE: Laughter, fails/bloopers, unexpected reactions, comedic timing.
Volume spikes followed by laughter = something hilarious happened.
IGNORE: normal conversation. Only pick moments that would make someone laugh.`,
    conversation: `You are a conversation highlight expert. Find the best DIALOGUE moments.
PRIORITIZE: Hot takes, storytelling, heated debates, emotional moments, deep insights.`,
  }

  return `${modeInstructions[mode] || modeInstructions.default}

CRITICAL RULES:
- You MUST spread clips across the entire video duration
- Each clip MUST be at a DIFFERENT part of the video (at least 60 seconds apart)
- SKIP the first 5 minutes (usually intro/waiting room/music)

CONTEXT: Find the top ${safeClipCount} moments for ~${clipLength}-second clips from a ${videoDurationMin} minute video.

CHAPTERS:
${segments || 'No chapters available'}

KEY HIGHLIGHTS:
${highlights || 'No highlights available'}

${(extraContext?.volumeSpikes?.length ?? 0) > 0 ? `AUDIO VOLUME SPIKES (loud = reactions/hype):
${extraContext!.volumeSpikes!.slice(0, 20).map(s => `[${Math.floor(s.startSec / 60)}:${String(Math.floor(s.startSec % 60)).padStart(2, '0')}] (${s.startSec}s) 🔊 ${s.spikeLevel}dB above average`).join('\n')}
` : ''}
${(extraContext?.hypeMoments?.length ?? 0) > 0 ? `HYPE PHRASES DETECTED:
${extraContext!.hypeMoments!.slice(0, 20).map(m => `[${Math.floor(m.startSec / 60)}:${String(Math.floor(m.startSec % 60)).padStart(2, '0')}] (${m.startSec}s) "${m.phrases.join('", "')}" (${m.count} triggers)`).join('\n')}
` : ''}
TRANSCRIPT SAMPLES:
${sampleTranscript(transcript.text ?? '', words)}

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

CLIP RULES:
- Each clip ≈ ${clipLength} seconds (end_time - start_time)
- Clips MUST NOT overlap — at least 60 seconds between clip start times
- Spread clips across the ENTIRE video
- ONLY select timestamps where there is actual speech in the transcript
- Return exactly ${safeClipCount} moments`
}

/**
 * Candidate-rank pipeline: System finds candidates → scores → picks best
 */
export async function scoreTranscriptWithGroq(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
  volumeSpikes?: Array<{ startSec: number; spikeLevel: number }>,
  detectionMode?: string,
): Promise<ScoredMoment[]> {
  const words = transcript.words ?? []
  if (words.length === 0) return fallbackFromHighlights(transcript, aiFocus, clipCount, clipLength)

  const totalDurationSec = words[words.length - 1].end / 1000
  const clipLengthMs = clipLength * 1000
  const mode = detectionMode || 'default'

  console.log(`[groq] Candidate-rank pipeline, mode: ${mode}, ${Math.round(totalDurationSec / 60)}min video`)

  // ─── Step 1: Build candidate segments from system signals ───
  const candidates: Array<{
    startSec: number
    endSec: number
    text: string
    wordCount: number
    volumeSpike: number
    hypeCount: number
    hypeWords: string[]
    _score?: number
  }> = []

  const windowStep = 15000 // Slide every 15s
  const totalMs = words[words.length - 1].end

  // Skip intro: 5 min for long videos (>30min), 2 min for shorter
  const introSkipMs = totalDurationSec > 1800 ? 300000 : 120000
  for (let startMs = introSkipMs; startMs < totalMs - clipLengthMs; startMs += windowStep) {
    const endMs = startMs + clipLengthMs
    const segWords = words.filter(w => w.start >= startMs && w.end <= endMs)
    
    if (segWords.length < 2) continue

    const segText = segWords.map(w => {
      const t = (w.text || '').trim()
      if (t.startsWith('[') || t.startsWith('(')) return ''
      return t
    }).filter(Boolean).join(' ')

    if (segText.length < 30) continue

    // Count volume spikes in this window
    const spikesInWindow = (volumeSpikes || []).filter(
      s => s.startSec >= startMs / 1000 && s.startSec < endMs / 1000
    )
    const spikeCount = spikesInWindow.length

    // Check for hype phrases
    const lowerText = segText.toLowerCase()
    const matched = HYPE_PHRASES.filter(p => lowerText.includes(p))

    candidates.push({
      startSec: Math.round(startMs / 1000),
      endSec: Math.round(endMs / 1000),
      text: segText.slice(0, 200),
      wordCount: segWords.length,
      volumeSpike: spikeCount,
      hypeCount: matched.length,
      hypeWords: matched,
    })
  }

  console.log(`[groq] Generated ${candidates.length} candidate segments from speech`)

  // If very few speech candidates, add volume-spike-only segments
  if (candidates.length < clipCount * 2 && (volumeSpikes?.length ?? 0) > 0) {
    console.log(`[groq] Low speech (${candidates.length} candidates) — adding volume-spike-only segments`)
    for (const spike of volumeSpikes!) {
      const spikeMs = spike.startSec * 1000
      if (spikeMs < introSkipMs) continue
      const startMs = spikeMs
      const endMs = startMs + clipLengthMs
      if (candidates.some(c => Math.abs(c.startSec - spike.startSec) < 30)) continue
      
      const segWords = words.filter(w => w.start >= startMs && w.end <= endMs)
      const segText = segWords.map(w => (w.text || '').trim()).filter(Boolean).join(' ')
      
      candidates.push({
        startSec: spike.startSec,
        endSec: Math.round(endMs / 1000),
        text: segText || `[Volume spike: ${spike.spikeLevel}dB above average]`,
        wordCount: segWords.length,
        volumeSpike: 3,
        hypeCount: 0,
        hypeWords: [],
      })
    }
    console.log(`[groq] Now ${candidates.length} candidates (with volume-only segments)`)
  }

  // ─── Step 2: Score candidates by mode ───
  for (const c of candidates) {
    let score = 0
    if (mode === 'gaming') {
      // Gaming: hype phrases PRIMARY, volume spikes low weight
      const gamingPhrases = ['got em','killed','headshot','clutch','let\'s go','we won','dead','eliminated','wiped','oh shit','no way','what the','holy','dude','bro']
      const gamingHits = c.hypeWords.filter(w => gamingPhrases.includes(w)).length
      score = gamingHits * 15 + c.hypeCount * 5 + c.volumeSpike * 5 + (c.wordCount > 20 ? 5 : 0)
    } else if (mode === 'funny') {
      // Funny: volume spikes PRIMARY, laughter words PRIMARY
      const funnyPhrases = ['haha','bruh','im dead','i\'m dead','lmao','no no no','stop','why','bro what','nooo','are you serious','come on','crazy']
      const funnyHits = c.hypeWords.filter(w => funnyPhrases.includes(w)).length
      score = funnyHits * 12 + c.hypeCount * 4 + c.volumeSpike * 12 + (c.wordCount > 40 ? 8 : 0)
    } else if (mode === 'conversation') {
      // Conversation: word density PRIMARY
      score = c.wordCount * 3 + c.hypeCount * 2 + c.volumeSpike * 5
      if (c.wordCount > 50) score += 15
    } else {
      // Default: balanced
      score = c.hypeCount * 6 + c.volumeSpike * 8 + Math.min(c.wordCount, 30) * 2
    }
    c._score = score
  }

  // Sort by score descending
  candidates.sort((a, b) => (b._score || 0) - (a._score || 0))

  // ─── Step 3: Pick top N non-overlapping, spread across video ───
  const minSpacing = Math.max(45, Math.round(totalDurationSec / (clipCount * 3)))
  const picked: typeof candidates = []

  for (const c of candidates) {
    if (picked.length >= clipCount * 2) break
    if (picked.some(p => Math.abs(p.startSec - c.startSec) < minSpacing)) continue
    picked.push(c)
  }

  console.log(`[groq] Picked ${picked.length} spaced candidates (need ${clipCount})`)

  if (picked.length === 0) {
    return fallbackFromHighlights(transcript, aiFocus, clipCount, clipLength)
  }

  // ─── Step 4: Return top candidates (skip AI ranking if no API key or exact count) ───
  if (!GROQ_API_KEY || picked.length <= clipCount) {
    return picked.slice(0, clipCount).map(c => ({
      start_time: c.startSec,
      end_time: c.endSec,
      virality_score: Math.min(10, Math.max(1, Math.round((c._score || 5) / 5))),
      matched_categories: aiFocus.slice(0, 2),
      ai_reason: c.hypeWords.length > 0
        ? `Detected: "${c.hypeWords.join('", "')}"${c.volumeSpike > 0 ? ` + ${c.volumeSpike} volume spike(s)` : ''}`
        : c.volumeSpike > 0
        ? `${c.volumeSpike} volume spike(s) — loud reaction`
        : `High speech density (${c.wordCount} words)`,
    }))
  }

  // Sort picked by time for AI context
  const forAI = picked.sort((a, b) => a.startSec - b.startSec)

  const modeDesc: Record<string, string> = {
    default: 'most viral and engaging',
    gaming: 'best gaming moments (kills, clutch plays, victories)',
    funny: 'funniest moments (laughter, fails, comedic)',
    conversation: 'most interesting conversation highlights',
  }

  const aiPrompt = `You are ranking pre-selected clip candidates from a gaming stream.
Pick the ${clipCount} ${modeDesc[mode] || modeDesc.default} moments from these candidates.

CANDIDATES (ranked by system score, pick the best ${clipCount}):
${forAI.map((c, i) => `[${i+1}] ${Math.floor(c.startSec/60)}:${String(Math.floor(c.startSec%60)).padStart(2,'0')} (${c.startSec}s) score=${c._score} | "${c.text.slice(0,100)}" | hype: ${c.hypeWords.join(', ') || 'none'} | volume: ${c.volumeSpike}`).join('\n')}

Return ONLY valid JSON:
{ "selected": [${Array.from({length: clipCount}, (_, i) => `{"index": <1-${forAI.length}>, "virality_score": <1-10>, "ai_reason": "<reason>"}`).join(', ')}] }`

  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: aiPrompt }],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })

    if (!res.ok) {
      console.error('[groq] AI ranking failed:', res.status)
      return picked.slice(0, clipCount).map(c => ({
        start_time: c.startSec,
        end_time: c.endSec,
        virality_score: Math.min(10, Math.max(1, Math.round((c._score || 5) / 5))),
        matched_categories: aiFocus.slice(0, 2),
        ai_reason: c.hypeWords.length > 0
          ? `Detected: "${c.hypeWords.join('", "')}"${c.volumeSpike > 0 ? ` + ${c.volumeSpike} volume spike(s)` : ''}`
          : `High speech density (${c.wordCount} words)`,
      }))
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}')
    const selected = parsed.selected ?? []

    return selected.slice(0, clipCount).map((s: any) => {
      const idx = (s.index || 1) - 1
      const candidate = forAI[idx] || forAI[0]
      return {
        start_time: candidate.startSec,
        end_time: candidate.endSec,
        virality_score: s.virality_score || 7,
        matched_categories: aiFocus.slice(0, 2),
        ai_reason: s.ai_reason || `Selected by AI (score ${candidate._score})`,
      }
    })
  } catch (err) {
    console.error('[groq] AI ranking error:', err)
    return picked.slice(0, clipCount).map(c => ({
      start_time: c.startSec,
      end_time: c.endSec,
      virality_score: Math.min(10, Math.max(1, Math.round((c._score || 5) / 5))),
      matched_categories: aiFocus.slice(0, 2),
      ai_reason: c.hypeWords.length > 0
        ? `Detected: "${c.hypeWords.join('", "')}"${c.volumeSpike > 0 ? ` + ${c.volumeSpike} volume spike(s)` : ''}`
        : `High speech density (${c.wordCount} words)`,
    }))
  }
}

function fallbackFromHighlights(
  transcript: AssemblyAIResult,
  aiFocus: AIFocus[],
  clipCount: number,
  clipLength: number,
): ScoredMoment[] {
  const moments: ScoredMoment[] = []

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
