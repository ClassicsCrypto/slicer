import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { submitTranscription } from '@/lib/assemblyai'
import { ProcessingOptions } from '@/types'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sourceUrl, title, options } = body as {
      sourceUrl: string
      title: string
      options: ProcessingOptions
    }

    if (!sourceUrl) {
      return NextResponse.json({ error: 'sourceUrl is required' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Determine user id (dev bypass or anonymous)
    const devUserId = process.env.NEXT_PUBLIC_DEV_USER_ID
    const userId = devUserId ?? uuidv4()

    // Create job in processing state
    const jobId = uuidv4()
    const { error: insertError } = await supabase.from('jobs').insert({
      id: jobId,
      user_id: userId,
      title: title || new URL(sourceUrl).hostname,
      source_url: sourceUrl,
      status: 'processing',
      options,
      progress: {
        phase: 'submitting',
        completedClips: [],
      },
    })

    if (insertError) {
      console.error('Job insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }

    // Submit AssemblyAI transcription — fire & forget
    ;(async () => {
      try {
        const transcriptId = await submitTranscription(sourceUrl)

        await supabase
          .from('jobs')
          .update({
            progress: {
              phase: 'transcribing',
              transcriptId,
              completedClips: [],
            },
          })
          .eq('id', jobId)
      } catch (err) {
        console.error('AssemblyAI submission error:', err)
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            progress: { phase: 'failed', error: String(err), completedClips: [] },
          })
          .eq('id', jobId)
      }
    })()

    return NextResponse.json({ jobId }, { status: 201 })
  } catch (err) {
    console.error('Process route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
