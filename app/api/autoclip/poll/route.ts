import { NextRequest, NextResponse } from 'next/server'
import { buildAutoclipFingerprint, findAutoclipDuplicate, getAutoclipCreatorKey, listAutoclipSubscriptions, recordAutoclipEvent, updateAutoclipSubscription } from '@/lib/autoclip-store'
import { findLatestTwitchSource } from '@/lib/twitch'
import { findLatestYouTubeSource } from '@/lib/youtube'
import { findLatestXSource } from '@/lib/x'
import { requireAuth } from '@/lib/auth'
import { getInternalRequestHeaders, isTrustedInternalRequest } from '@/lib/internal-request'
import { getJobRecord } from '@/lib/job-store/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function triggerRun(origin: string, subscriptionId: string, source: { id: string; url: string; title: string }, cookie?: string | null, internalRequest = false) {
  const response = await fetch(`${origin}/api/autoclip/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: cookie || '',
      ...(internalRequest ? getInternalRequestHeaders() : {}),
    },
    body: JSON.stringify({
      subscriptionId,
      sourceUrl: source.url,
      streamId: source.id,
      title: source.title,
    }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `run failed with ${response.status}`)
  return payload
}

export async function POST(request: NextRequest) {
  const internalRequest = isTrustedInternalRequest(request)
  const auth = internalRequest ? null : requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const startedAt = new Date().toISOString()
  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'live' ? 'live' : 'vod'
  const dryRun = Boolean(body.dryRun)
  const platformPriority: Record<string, number> = { twitch: 0, youtube: 1, x: 2, direct: 3 }
  const scope = internalRequest ? undefined : { userId: auth!.user.id, workspaceId: auth!.workspace.id }
  const subscriptions = listAutoclipSubscriptions('active', scope).sort((a, b) => (platformPriority[a.platform] ?? 9) - (platformPriority[b.platform] ?? 9))
  const results: any[] = []

  for (const subscription of subscriptions) {
    if (subscription.platform !== 'twitch' && subscription.platform !== 'youtube' && subscription.platform !== 'x') {
      results.push({ subscriptionId: subscription.id, platform: subscription.platform, status: 'skipped', reason: 'platform connector not implemented yet' })
      continue
    }

    try {
      const source = subscription.platform === 'youtube'
        ? await findLatestYouTubeSource(subscription.handle || subscription.channelUrl || '')
        : subscription.platform === 'x'
          ? await findLatestXSource(subscription.handle || subscription.channelUrl || '')
          : await findLatestTwitchSource(subscription.handle || subscription.channelUrl || '', mode)
      if (!source) {
        updateAutoclipSubscription(subscription.id, { lastCheckedAt: startedAt }, scope)
        results.push({ subscriptionId: subscription.id, status: 'no_source', mode })
        continue
      }

      if (source.id === subscription.lastSeenStreamId) {
        const lastJob = subscription.lastJobId ? await getJobRecord(subscription.lastJobId, 'autoclip/poll last-seen check') : null
        const lastJobUrl = String(lastJob?.raw_input_url || lastJob?.source_url || '')
        const canRetrySource = lastJob?.status === 'failed' || (lastJobUrl && lastJobUrl !== source.url)
        if (!canRetrySource) {
          updateAutoclipSubscription(subscription.id, { lastCheckedAt: startedAt }, scope)
          results.push({ subscriptionId: subscription.id, status: 'already_seen', source })
          continue
        }
      }

      const creatorKey = getAutoclipCreatorKey(subscription)
      const fingerprint = buildAutoclipFingerprint({ creatorKey, title: source.title, publishedAt: (source as any).publishedAt || (source as any).startedAt })
      const duplicate = findAutoclipDuplicate({ creatorKey, fingerprint, sourceId: source.id, publishedAt: (source as any).publishedAt || (source as any).startedAt }, scope)
      const duplicateEvent = duplicate as any
      const samePlatformDifferentSource = duplicateEvent
        && duplicateEvent.platform === subscription.platform
        && duplicateEvent.source_id !== source.id
      if (duplicate && !samePlatformDifferentSource) {
        updateAutoclipSubscription(subscription.id, { lastCheckedAt: startedAt, lastSeenStreamId: source.id }, scope)
        results.push({ subscriptionId: subscription.id, status: 'duplicate_stream', source, duplicate })
        continue
      }

      if (dryRun) {
        updateAutoclipSubscription(subscription.id, { lastCheckedAt: startedAt }, scope)
        results.push({ subscriptionId: subscription.id, status: 'would_queue', source, fingerprint })
        continue
      }

      const run = await triggerRun(request.nextUrl.origin, subscription.id, source, request.headers.get('cookie'), internalRequest)
      recordAutoclipEvent({
        userId: internalRequest ? (subscription.userId ?? undefined) : auth!.user.id,
        workspaceId: internalRequest ? (subscription.workspaceId ?? undefined) : auth!.workspace.id,
        subscriptionId: subscription.id,
        creatorKey,
        fingerprint,
        platform: subscription.platform,
        sourceId: source.id,
        sourceUrl: source.url,
        title: source.title,
        jobId: run.jobId,
        detectedAt: (source as any).publishedAt || (source as any).startedAt || startedAt,
      })
      updateAutoclipSubscription(subscription.id, {
        lastCheckedAt: startedAt,
        lastSeenStreamId: source.id,
        lastJobId: run.jobId,
      }, scope)
      results.push({ subscriptionId: subscription.id, status: 'queued', source, jobId: run.jobId })
    } catch (error: any) {
      const cause = error?.cause
      const details = [
        error?.message || 'unknown error',
        cause?.code,
        cause?.hostname,
        cause?.message,
      ].filter(Boolean).join(' | ')
      results.push({ subscriptionId: subscription.id, platform: subscription.platform, status: 'error', error: details })
    }
  }

  return NextResponse.json({ checkedAt: startedAt, mode, dryRun, results })
}
