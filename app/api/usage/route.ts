import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getJobStoreKind, isSqliteJobStore, listJobRecordsForUsers } from '@/lib/job-store/store'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function getDirectorySizeBytes(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0
  const stats = fs.statSync(targetPath)
  if (stats.isFile()) return stats.size

  return fs.readdirSync(targetPath).reduce((sum, entry) => {
    return sum + getDirectorySizeBytes(path.join(targetPath, entry))
  }, 0)
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const allJobs = await listJobRecordsForUsers([auth.user.id], 1000, 'api/usage GET')
    const completedJobs = allJobs.filter((job) => job.status === 'complete')

    let totalClips = 0
    let totalVideoDurationSec = 0

    for (const job of completedJobs) {
      const progress = job.progress as Record<string, any> | null
      const clips = (progress?.completedClips || []) as Array<any>
      totalClips += clips.length

      const videoDuration = progress?.duration || progress?.videoDuration || 0
      if (videoDuration > 0) {
        totalVideoDurationSec += videoDuration
      }
    }

    const totalHoursProcessed = totalVideoDurationSec / 3600
    const groqRequestsEstimate = completedJobs.length

    let storageMB = 0
    const storageBreakdown: Array<{ folder: string; files: number; mb: number }> = []

    if (isSqliteJobStore()) {
      const folders = [
        { folder: 'temp', fullPath: path.join(process.cwd(), 'server', 'temp') },
        { folder: 'data', fullPath: path.join(process.cwd(), 'server', 'data') },
      ]

      for (const folder of folders) {
        const folderBytes = getDirectorySizeBytes(folder.fullPath)
        const folderMB = folderBytes / (1024 * 1024)
        storageBreakdown.push({
          folder: folder.folder,
          files: fs.existsSync(folder.fullPath)
            ? fs.readdirSync(folder.fullPath, { recursive: true }).length
            : 0,
          mb: parseFloat(folderMB.toFixed(2)),
        })
        storageMB += folderMB
      }
    } else {
      const supabase = createServerClient()
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
    }

    const storageLimitMb = isSqliteJobStore() ? 10240 : 1000

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
        limit: storageLimitMb,
        unit: 'MB',
        breakdown: storageBreakdown,
        mode: getJobStoreKind(),
      },
      stats: {
        totalJobs: completedJobs.length,
        totalClips,
        totalHoursProcessed: parseFloat(totalHoursProcessed.toFixed(2)),
        avgClipsPerJob: completedJobs.length > 0
          ? parseFloat((totalClips / completedJobs.length).toFixed(1))
          : 0,
        exportsCount: 0,
      },
      recentJobs: allJobs.slice(0, 10).map((job) => {
        const prog = job.progress as Record<string, any> | null
        const clips = (prog?.completedClips || []) as Array<any>
        return {
          id: job.id,
          title: job.title || 'Untitled',
          status: job.status,
          duration: 0,
          clipCount: clips.length,
          created_at: job.created_at,
        }
      }),
    }

    return NextResponse.json(usageData)
  } catch (err: any) {
    console.error('[usage] Error:', err)
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 })
  }
}
