import { NextRequest, NextResponse } from 'next/server'
import { getServerApiUrl, backendAuthHeaders } from '@/lib/api-url-server'
import { findJobByClipId } from '@/lib/job-store/store'
import { getClipStableId } from '@/lib/clip-id'
import { requireSlicerApiAuth } from '@/lib/slicer-api-auth'
import { normalizeJobForApi } from '@/lib/slicer-api-response'
import { SubtitleOptions } from '@/types'
import { DEFAULT_SUBTITLE_OPTIONS } from '@/lib/subtitle-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_SUBTITLES: SubtitleOptions = { ...DEFAULT_SUBTITLE_OPTIONS, outlineThickness: 'thick' }

function validFormat(value: string | null) {
  if (value === 'twitter' || value === 'tiktok' || value === 'youtube_shorts' || value === 'custom') return value
  return 'twitter'
}

function boolParam(value: string | null, fallback: boolean) {
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export async function GET(request: NextRequest, { params }: { params: { clipId: string } }) {
  const auth = requireSlicerApiAuth(request, 'clips:export')
  if (auth instanceof NextResponse) return auth

  // Owner-scoped lookup over the workspace's 100 most-recent jobs (DB-level
  // predicate, same stable-id-or-raw-id match as before).
  const rawFound = await findJobByClipId(auth.workspaceUserIds, params.clipId, 100, 'api/v1/clips/[clipId]/download')
  const found = rawFound
    ? (() => {
        const job = normalizeJobForApi(rawFound.job)
        const clip = (job.clips || []).find((entry: any) => getClipStableId(entry) === params.clipId || entry.id === params.clipId) ?? rawFound.clip
        return { job, clip }
      })()
    : null

  if (!found) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })
  if (!found.job.source_url) return NextResponse.json({ error: 'Job has no source URL available for export' }, { status: 409 })

  const url = request.nextUrl
  const aspectRatio = validFormat(url.searchParams.get('format'))
  const watermarkEnabled = boolParam(url.searchParams.get('watermark'), true)
  const subtitlesEnabled = boolParam(url.searchParams.get('subtitles'), true)
  const startTime = Number(url.searchParams.get('start') || found.clip.start_time)
  const endTime = Number(url.searchParams.get('end') || found.clip.end_time)

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return NextResponse.json({ error: 'Invalid start/end times' }, { status: 400 })
  }

  const apiBase = await getServerApiUrl()
  const clipResponse = await fetch(`${apiBase}/clip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...backendAuthHeaders() },
    body: JSON.stringify({
      sourceUrl: found.job.source_url,
      startTime,
      endTime,
      title: `${found.job.title || 'slicer'}-${Math.round(startTime)}s`,
      subtitles: found.clip.subtitles || [],
      subtitleOptions: {
        ...DEFAULT_SUBTITLES,
        ...(found.job.options?.subtitles || {}),
        enabled: subtitlesEnabled,
        watermarkEnabled,
      },
      aspectRatio,
      originalStartTime: found.clip.start_time,
    }),
  })

  if (!clipResponse.ok || !clipResponse.body) {
    const payload = await clipResponse.json().catch(() => ({}))
    return NextResponse.json({ error: payload.error || `Clip export failed with ${clipResponse.status}` }, { status: 502 })
  }

  const headers = new Headers()
  headers.set('Content-Type', clipResponse.headers.get('content-type') || 'video/mp4')
  const disposition = clipResponse.headers.get('content-disposition') || `attachment; filename="${params.clipId}.mp4"`
  headers.set('Content-Disposition', disposition)
  const length = clipResponse.headers.get('content-length')
  if (length) headers.set('Content-Length', length)
  headers.set('Cache-Control', 'no-store')

  return new NextResponse(clipResponse.body, { status: 200, headers })
}
