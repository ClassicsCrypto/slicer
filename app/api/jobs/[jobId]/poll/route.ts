import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { pollTranscription } from '@/lib/assemblyai'
import { scoreTranscriptWithGroq } from '@/lib/groq'
import { Clip, SubtitleWord } from '@/types'
import { AssemblyAIResult } from '@/lib/assemblyai'
import { v4 as uuidv4 } from 'uuid'

/**
 * Extract word-level subtitles for a clip from AssemblyAI transcript words.
 * Times are converted to seconds relative to clip start.
 */
function extractSubtitles(
  transcript: AssemblyAIResult,
  clipStartSec: number,
  clipEndSec: number,
): SubtitleWord[] {
  const words = transcript.words ?? []
  const subs: SubtitleWord[] = []

  for (const w of words) {
    const wordStartSec = w.start / 1000
    const wordEndSec = w.end / 1000

    // Only include words that fall within the clip's time range
    if (wordStartSec >= clipStartSec && wordEndSec <= clipEndSec + 0.5) {
      subs.push({
        text: w.text,
        start: parseFloat((wordStartSec - clipStartSec).toFixed(2)),
        end: parseFloat((wordEndSec - clipStartSec).toFixed(2)),
      })
    }
  }

  return subs
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const { jobId } = params
  const supabase = createServerClient()

  try {
    // Fetch job
    const { data: jobs, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .limit(1)

    const job = jobs?.[0]
    if (jobError || !job) {
      console.error(`[poll] job ${jobId} not found:`, jobError?.message)
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    console.log(`[poll] job ${jobId} status=${job.status} phase=${job.progress?.phase}`)

    // Already complete or failed — return current state
    if (job.status === 'complete' || job.status === 'failed') {
      const clips = (job.progress?.completedClips ?? []) as Clip[]
      return NextResponse.json({ status: job.status, clips })
    }

    const transcriptId = job.progress?.transcriptId as string | undefined
    const localTranscribeId = job.progress?.localTranscribeId as string | undefined
    const transcriptionMode = job.progress?.transcriptionMode as string | undefined

    // ─── Local Whisper path ───
    if (transcriptionMode === 'local' && localTranscribeId) {
      try {
        const { getApiUrl } = await import('@/lib/api-url')
        const apiBase = await getApiUrl()
        const pollRes = await fetch(`${apiBase}/transcribe-poll/${localTranscribeId}`)
        const pollData = await pollRes.json()

        if (pollData.status === 'error') {
          await supabase.from('jobs').update({
            status: 'failed',
            progress: { ...job.progress, phase: 'failed', error: pollData.error },
          }).eq('id', jobId)
          return NextResponse.json({ status: 'failed', error: pollData.error })
        }

        if (pollData.status !== 'complete') {
          return NextResponse.json({ status: 'processing', phase: 'transcribing', progress: pollData.progress })
        }

        // Convert local Whisper result to AssemblyAI-compatible format
        const whisperResult = pollData.result
        const transcript: AssemblyAIResult = {
          id: localTranscribeId,
          status: 'completed',
          text: whisperResult.text,
          words: (whisperResult.words || []).map((w: any) => ({
            text: w.text,
            start: w.start,  // already in ms
            end: w.end,
            confidence: w.confidence || 0.9,
          })),
        }

        // Continue to scoring (same as AssemblyAI path below)
        console.log(`[poll] Local Whisper complete! ${whisperResult.words?.length} words. Calling Groq...`)
        await supabase.from('jobs').update({
          progress: { ...job.progress, phase: 'scoring' },
        }).eq('id', jobId)

        // Score and create clips (shared logic below)
        return await scoreAndCreateClips(supabase, job, jobId, transcript)
      } catch (err) {
        console.error('[poll] Local Whisper poll error:', err)
        return NextResponse.json({ status: 'processing', phase: 'transcribing' })
      }
    }

    // ─── AssemblyAI path ───
    // Not yet submitted
    if (!transcriptId) {
      return NextResponse.json({ status: 'processing', phase: 'submitting' })
    }

    // Poll AssemblyAI
    const transcript = await pollTranscription(transcriptId)

    if (transcript.status === 'error') {
      await supabase.from('jobs').update({
        status: 'failed',
        progress: {
          ...job.progress,
          phase: 'failed',
          error: transcript.error ?? 'AssemblyAI error',
        },
      }).eq('id', jobId)

      return NextResponse.json({ status: 'failed', error: transcript.error })
    }

    if (transcript.status !== 'completed') {
      return NextResponse.json({ status: 'processing', phase: 'transcribing' })
    }

    // Transcript complete — score with Groq (AssemblyAI path)
    console.log(`[poll] transcript complete! Calling Groq for scoring...`)
    return await scoreAndCreateClips(supabase, job, jobId, transcript)
  } catch (err) {
    console.error('Poll route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Shared scoring + clip creation logic
async function scoreAndCreateClips(supabase: any, job: any, jobId: string, transcript: AssemblyAIResult) {
  try {
    await supabase.from('jobs').update({
      progress: { ...job.progress, phase: 'scoring' },
    }).eq('id', jobId)

    const options = job.options
    console.log(`[poll] options: clipCount=${options.clipCount} clipLength=${options.clipLength} aiFocus=${JSON.stringify(options.aiFocus)}`)
    
    let moments: Awaited<ReturnType<typeof scoreTranscriptWithGroq>> = []
    try {
      moments = await scoreTranscriptWithGroq(
        transcript,
        options.aiFocus ?? [],
        options.clipCount ?? 5,
        parseInt(options.clipLength ?? '30'),
      )
      console.log(`[poll] Groq returned ${moments.length} moments`)
    } catch (groqErr) {
      console.error(`[poll] Groq scoring FAILED:`, groqErr)
      moments = []
    }

    // If no moments from AI, create sequential fallback clips
    if (moments.length === 0) {
      console.log(`[poll] no AI moments — using sequential fallback`)
      const clipCount = job.options?.clipCount ?? 3
      const clipLength = parseInt(job.options?.clipLength ?? '30')
      for (let i = 0; i < clipCount; i++) {
        moments.push({
          start_time: i * Math.ceil(clipLength / 2),
          end_time: i * Math.ceil(clipLength / 2) + clipLength,
          virality_score: 5,
          matched_categories: job.options?.aiFocus?.slice(0, 1) ?? [],
          ai_reason: 'Sequential clip placement (no speech detected)',
        })
      }
    }

    const clipMode = process.env.CLIP_MODE ?? 'instant'
    const clips: Clip[] = moments.map((m) => {
      const clipId = uuidv4()
      const r2Key =
        clipMode === 'instant'
          ? `${job.source_url}#t=${m.start_time},${m.end_time}`
          : `clips/${jobId}/${clipId}.mp4`

      // Extract word-level subtitles for this clip's time range
      const subtitles = extractSubtitles(transcript, m.start_time, m.end_time)

      return {
        id: clipId,
        job_id: jobId,
        render_id: '',
        r2_key: r2Key,
        duration: m.end_time - m.start_time,
        start_time: m.start_time,
        end_time: m.end_time,
        matched_categories: m.matched_categories,
        ai_reason: m.ai_reason,
        virality_score: m.virality_score,
        subtitles,
        created_at: new Date().toISOString(),
      }
    })

    // Store clips in job.progress.completedClips and mark complete
    await supabase.from('jobs').update({
      status: 'complete',
      progress: {
        ...job.progress,
        phase: 'complete',
        completedClips: clips,
      },
    }).eq('id', jobId)

    return NextResponse.json({ status: 'complete', clips })
  } catch (err) {
    console.error('scoreAndCreateClips error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
