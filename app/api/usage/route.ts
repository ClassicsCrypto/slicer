import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerClient()

    // Get all jobs — clips are stored inside progress.completedClips
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, title, status, source_url, options, progress, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    const allJobs = jobs || []
    const completedJobs = allJobs.filter(j => j.status === 'complete')

    // Calculate aggregate stats from ALL completed jobs in database
    let totalClips = 0
    let totalVideoDurationSec = 0

    for (const job of completedJobs) {
      const progress = job.progress as Record<string, any> | null
      const clips = (progress?.completedClips || []) as Array<any>
      totalClips += clips.length

      // Get actual video duration from progress (stored during download/transcription)
      const videoDuration = progress?.duration || progress?.videoDuration || 0
      if (videoDuration > 0) {
        totalVideoDurationSec += videoDuration
      }
    }

    // Total hours of video analyzed (for transcription metric)
    const totalHoursProcessed = totalVideoDurationSec / 3600

    // Supabase storage: inspect active folders in the slicer-videos bucket
    let storageMB = 0
    const storageBreakdown: Array<{ folder: string; files: number; mb: number }> = []
    try {
      for (const folder of ['uploads', 'youtube', 'config', 'test']) {
        const { data: files } = await supabase.storage.from('slicer-videos').list(folder, { limit: 1000 })
        const folderMB = (files || []).reduce((acc, f) => acc + ((f.metadata?.size || 0) / (1024 * 1024)), 0)
        storageBreakdown.push({
          folder,
          files: files?.length || 0,
          mb: parseFloat(folderMB.toFixed(2)),
        })
        storageMB += folderMB
      }
    } catch {
      // storage query failed, default to 0
    }

    // Groq usage: estimate from completed jobs (each job = 1 LLM call)
    const groqRequestsEstimate = completedJobs.length

    const usageData = {
      assemblyai: {
        used: parseFloat((totalHoursProcessed * 60).toFixed(0)),
        limit: 300,
        unit: 'min/month',
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
        breakdown: storageBreakdown,
      },
      stats: {
        totalJobs: completedJobs.length,
        totalClips,
        totalHoursProcessed: parseFloat(totalHoursProcessed.toFixed(2)),
        avgClipsPerJob: completedJobs.length > 0
          ? parseFloat((totalClips / completedJobs.length).toFixed(1))
          : 0,
        exportsCount: 0, // TODO: track exports
      },
      recentJobs: allJobs.slice(0, 10).map(j => {
        const prog = j.progress as Record<string, any> | null
        const clips = (prog?.completedClips || []) as Array<any>
        return {
          id: j.id,
          title: j.title || 'Untitled',
          status: j.status,
          duration: 0,
          clipCount: clips.length,
          created_at: j.created_at,
        }
      }),
    }

    return NextResponse.json(usageData)
  } catch (err: any) {
    console.error('[usage] Error:', err)
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 })
  }
}
