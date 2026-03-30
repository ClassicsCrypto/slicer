import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { pollTranscription } from '@/lib/assemblyai'
import { scoreTranscriptWithGroq } from '@/lib/groq'
import { Clip } from '@/types'
import { v4 as uuidv4 } from 'uuid'

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

    // Not yet submitted to AssemblyAI
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

    // Transcript complete — score with Groq
    console.log(`[poll] transcript complete! Calling Groq for scoring...`)
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

    const clipMode = process.env.CLIP_MODE ?? 'instant'
    const clips: Clip[] = moments.map((m) => {
      const clipId = uuidv4()
      const r2Key =
        clipMode === 'instant'
          ? `${job.source_url}#t=${m.start_time},${m.end_time}`
          : `clips/${jobId}/${clipId}.mp4`

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
        created_at: new Date().toISOString(),
      }
    })

    // Store clips in job.progress.completedClips and mark complete
    await supabase.from('jobs').update({
      status: 'complete',
      progress: {
        ...job.progress,
        phase: 'complete',
        transcriptId,
        completedClips: clips,
      },
    }).eq('id', jobId)

    return NextResponse.json({ status: 'complete', clips })
  } catch (err) {
    console.error('Poll route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
