const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY!
const BASE_URL = 'https://api.assemblyai.com/v2'

export interface TranscriptSegment {
  text: string
  start: number // ms
  end: number   // ms
  confidence: number
}

export interface AssemblyAIResult {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  text?: string
  words?: TranscriptSegment[]
  auto_highlights_result?: {
    results: Array<{
      text: string
      rank: number
      timestamps: Array<{ start: number; end: number }>
    }>
  }
  chapters?: Array<{
    summary: string
    headline: string
    start: number
    end: number
  }>
  error?: string
}

export async function submitTranscription(audioUrl: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/transcript`, {
    method: 'POST',
    headers: {
      Authorization: ASSEMBLYAI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ['universal-2'],
      auto_highlights: true,
      auto_chapters: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`AssemblyAI submit failed: ${res.status} ${body}`)
  }

  const data = await res.json()
  return data.id as string
}

export async function pollTranscription(transcriptId: string): Promise<AssemblyAIResult> {
  const res = await fetch(`${BASE_URL}/transcript/${transcriptId}`, {
    headers: { Authorization: ASSEMBLYAI_API_KEY },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`AssemblyAI poll failed: ${res.status} ${body}`)
  }

  const raw = await res.text()
  console.log(`[assemblyai] poll ${transcriptId}: raw_preview=${raw.slice(0, 300)}`)
  const data = JSON.parse(raw) as AssemblyAIResult
  console.log(`[assemblyai] poll ${transcriptId}: status=${data.status} text_length=${data.text?.length ?? 0}`)
  return data
}
