/**
 * AssemblyAI transcription — accepts a direct video URL, no file upload needed.
 * Docs: https://www.assemblyai.com/docs
 */

const ASSEMBLYAI_API = 'https://api.assemblyai.com/v2'

export interface TranscriptSegment {
  start: number   // milliseconds
  end: number     // milliseconds
  text: string
}

export interface HighlightResult {
  text: string
  rank: number
  timestamps: { start: number; end: number }[]
}

export interface TranscriptResult {
  text: string
  segments: TranscriptSegment[]
  highlights: HighlightResult[]
}

/**
 * Submit a video URL for transcription and poll until complete.
 * AssemblyAI processes the audio server-side — no download/upload from our end.
 * Typical turnaround: 15-30 seconds for a 10min video.
 */
export async function transcribeUrl(
  videoUrl: string,
  timeoutMs = 50000
): Promise<TranscriptResult> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) throw new Error('ASSEMBLYAI_API_KEY not set')

  // Step 1: Submit transcription job
  const submitRes = await fetch(`${ASSEMBLYAI_API}/transcript`, {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: videoUrl,
      speech_models: ['universal-2'],  // required by AssemblyAI v2 API
      auto_highlights: true,
      auto_chapters: true,
    }),
  })

  if (!submitRes.ok) {
    const err = await submitRes.text()
    throw new Error(`AssemblyAI submit failed: ${submitRes.status} ${err}`)
  }

  const { id: transcriptId } = await submitRes.json()
  console.log(`[assemblyai] submitted transcript job: ${transcriptId}`)

  // Step 2: Poll until complete
  const deadline = Date.now() + timeoutMs
  const POLL_INTERVAL = 3000 // 3 seconds between polls

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL)

    const pollRes = await fetch(`${ASSEMBLYAI_API}/transcript/${transcriptId}`, {
      headers: { 'Authorization': apiKey },
    })

    if (!pollRes.ok) continue

    const data = await pollRes.json()
    console.log(`[assemblyai] status: ${data.status}`)

    if (data.status === 'completed') {
      // Convert AssemblyAI word timestamps to our segment format
      const segments = buildSegments(data.words || [], data.auto_highlights?.results || [])
      const highlights: HighlightResult[] = (data.auto_highlights?.results || []).map(
        (h: { text: string; rank: number; timestamps: { start: number; end: number }[] }) => ({
          text: h.text,
          rank: h.rank,
          timestamps: h.timestamps,
        })
      )
      console.log(`[assemblyai] done: ${data.text?.length || 0} chars, ${segments.length} segments, ${highlights.length} highlights`)
      return {
        text: data.text || '',
        segments,
        highlights,
      }
    }

    if (data.status === 'error') {
      throw new Error(`AssemblyAI transcription error: ${data.error}`)
    }

    // status is 'queued' or 'processing' — keep polling
  }

  throw new Error('AssemblyAI transcription timed out')
}

interface AssemblyWord {
  start: number
  end: number
  text: string
}

interface AssemblyHighlight {
  text: string
  timestamps: { start: number; end: number }[]
}

/**
 * Build time-grouped segments from AssemblyAI word-level timestamps.
 * Groups words into ~5-second segments for GPT analysis.
 */
function buildSegments(
  words: AssemblyWord[],
  highlights: AssemblyHighlight[]
): TranscriptSegment[] {
  if (words.length === 0) {
    // No words — use highlight timestamps if available
    return highlights.flatMap(h =>
      h.timestamps.map(t => ({
        start: t.start,
        end: t.end,
        text: h.text,
      }))
    )
  }

  // Group words into ~5-second chunks
  const CHUNK_MS = 5000
  const segments: TranscriptSegment[] = []
  let chunkStart = words[0].start
  let chunkWords: string[] = []
  let chunkEnd = words[0].end

  for (const word of words) {
    if (word.start - chunkStart > CHUNK_MS && chunkWords.length > 0) {
      segments.push({ start: chunkStart, end: chunkEnd, text: chunkWords.join(' ') })
      chunkStart = word.start
      chunkWords = []
    }
    chunkWords.push(word.text)
    chunkEnd = word.end
  }

  if (chunkWords.length > 0) {
    segments.push({ start: chunkStart, end: chunkEnd, text: chunkWords.join(' ') })
  }

  return segments
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
