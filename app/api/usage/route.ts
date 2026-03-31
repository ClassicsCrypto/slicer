import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerClient()

    // Get all jobs
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, title, status, source_url, options, progress, clips, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const allJobs = jobs || []
    const completedJobs = allJobs.filter(j => j.status === 'complete')

    // Calculate total hours processed (estimate from clip durations)
    let totalClips = 0
    let totalDurationSec = 0
    for (const job of completedJobs) {
      const clips = job.clips || []
      totalClips += clips.length
      for (const clip of clips) {
        totalDurationSec += (clip.end_time || 0) - (clip.start_time || 0)
      }
    }

    // Estimate transcription hours (videos are typically longer than clips)
    // Use a rough estimate: average video ~15min for YouTube, total clips represent ~20% of source
    const estimatedTranscriptionHours = completedJobs.length * 0.25 // ~15min average per video

    // Supabase storage: list files in the slicer-videos bucket
    let storageMB = 0
    try {
      const { data: files } = await supabase.storage.from('slicer-videos').list('uploads', { limit: 1000 })
      if (files) {
        storageMB = files.reduce((acc, f) => acc + ((f.metadata?.size || 0) / (1024 * 1024)), 0)
      }
    } catch {
      // storage query failed, default to 0
    }

    // Groq usage: estimate from completed jobs (each job = 1 LLM call)
    const groqRequestsEstimate = completedJobs.length

    const usageData = {
      assemblyai: {
        used: parseFloat(estimatedTranscriptionHours.toFixed(2)),
        limit: 5,
        unit: 'hrs/month',
      },
      groq: {
        used: groqRequestsEstimate,
        limit: 14400,
        unit: 'requests/day',
      },
      supabase: {
        used: parseFloat(storageMB.toFixed(1)),
        limit: 1000,
        unit: 'MB',
      },
      stats: {
        totalJobs: allJobs.length,
        totalClips,
        totalHoursProcessed: parseFloat((totalDurationSec / 3600).toFixed(2)),
        avgClipsPerJob: completedJobs.length > 0
          ? parseFloat((totalClips / completedJobs.length).toFixed(1))
          : 0,
        exportsCount: 0, // TODO: track exports
      },
      recentJobs: allJobs.slice(0, 10).map(j => ({
        id: j.id,
        title: j.title || 'Untitled',
        status: j.status,
        duration: 0,
        clipCount: (j.clips || []).length,
        created_at: j.created_at,
      })),
    }

    return NextResponse.json(usageData)
  } catch (err: any) {
    console.error('[usage] Error:', err)
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 })
  }
}
