import { NextRequest, NextResponse } from 'next/server'
import { listAutoclipSubscriptions, updateAutoclipSubscription } from '@/lib/autoclip-store'
import { findLatestTwitchSource } from '@/lib/twitch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function triggerRun(origin: string, subscriptionId: string, source: { id: string; url: string; title: string }) {
  const response = await fetch(`${origin}/api/autoclip/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const startedAt = new Date().toISOString()
  const body = await request.json().catch(() => ({}))
  const mode = body.mode === 'live' ? 'live' : 'vod'
  const dryRun = Boolean(body.dryRun)
  const subscriptions = listAutoclipSubscriptions('active')
  const results: any[] = []

  for (const subscription of subscriptions) {
    if (subscription.platform !== 'twitch') {
      results.push({ subscriptionId: subscription.id, platform: subscription.platform, status: 'skipped', reason: 'platform connector not implemented yet' })
      continue
    }

    try {
      const source = await findLatestTwitchSource(subscription.handle || subscription.channelUrl || '', mode)
      if (!source) {
        updateAutoclipSubscription(subscription.id, { lastCheckedAt: startedAt })
        results.push({ subscriptionId: subscription.id, status: 'no_source', mode })
        continue
      }

      if (source.id === subscription.lastSeenStreamId) {
        updateAutoclipSubscription(subscription.id, { lastCheckedAt: startedAt })
        results.push({ subscriptionId: subscription.id, status: 'already_seen', source })
        continue
      }

      if (dryRun) {
        results.push({ subscriptionId: subscription.id, status: 'would_queue', source })
        continue
      }

      const run = await triggerRun(request.nextUrl.origin, subscription.id, source)
      updateAutoclipSubscription(subscription.id, {
        lastCheckedAt: startedAt,
        lastSeenStreamId: source.id,
        lastJobId: run.jobId,
      })
      results.push({ subscriptionId: subscription.id, status: 'queued', source, jobId: run.jobId })
    } catch (error: any) {
      results.push({ subscriptionId: subscription.id, status: 'error', error: error?.message || 'unknown error' })
    }
  }

  return NextResponse.json({ checkedAt: startedAt, mode, dryRun, results })
}
