import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { createJobRecord } from '@/lib/job-store/store'
import { getAutoclipSubscription, updateAutoclipSubscription } from '@/lib/autoclip-store'
import { ProcessingOptions } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_OPTIONS: ProcessingOptions = {
  clipCount: 10,
  clipLength: '30',
  detectionMode: 'gaming',
  aiFocus: ['intense_action', 'big_plays', 'hype_moments', 'funny_moments'],
  outputQuality: '720p',
  platformFormat: 'twitter',
  subtitles: {
    enabled: true,
    size: 'medium',
    color: '#ffffff',
    position: 'bottom',
    style: 'bold',
    background: 'none',
    font: 'impact',
    mode: 'word_pop',
    animationPreset: 'pop',
    outlineThickness: 'medium',
    outlineColor: '#000000',
    shadow: true,
    textCase: 'original',
    watermarkEnabled: true,
  },
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const subscription = getAutoclipSubscription(body.subscriptionId)
    if (!subscription) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    if (subscription.status !== 'active') return NextResponse.json({ error: 'Subscription is paused' }, { status: 409 })

    const rawInputUrl = String(body.sourceUrl || body.streamUrl || '').trim()
    if (!rawInputUrl) {
      return NextResponse.json({ error: 'sourceUrl/streamUrl is required until platform polling is enabled' }, { status: 400 })
    }

    const createdAt = new Date().toISOString()
    const jobId = body.jobId || uuidv4()
    const options = {
      ...DEFAULT_OPTIONS,
      ...(subscription.options || {}),
      ...(body.options || {}),
    }

    const job = await createJobRecord({
      id: jobId,
      user_id: '00000000-0000-0000-0000-000000000001',
      title: body.title || subscription.title || `${subscription.platform}:${subscription.handle || subscription.channelUrl}`,
      source_url: undefined,
      options,
      status: 'processing',
      progress: {
        phase: 'queued',
        progress: 'Queued by auto-clipping API.',
        inputKind: 'remote_url',
        rawInputUrl,
        sourceReady: false,
        requestedClipCount: options.clipCount,
        deliveredClipCount: 0,
        aiReturnedClipCount: 0,
        duplicateClipsRemoved: 0,
        processingStartedAt: createdAt,
        autoClipSubscriptionId: subscription.id,
      } as any,
      created_at: createdAt,
      updated_at: createdAt,
    }, 'api/autoclip/run create job')

    const processResponse = await fetch(`${request.nextUrl.origin}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        title: job.title,
        rawInputUrl,
        options,
        inputKind: 'remote_url',
      }),
    })

    if (!processResponse.ok) {
      const errorPayload = await processResponse.json().catch(() => ({}))
      return NextResponse.json({ error: errorPayload.error || 'Failed to start job', job }, { status: 500 })
    }

    updateAutoclipSubscription(subscription.id, {
      lastCheckedAt: createdAt,
      lastSeenStreamId: body.streamId || rawInputUrl,
      lastJobId: jobId,
    })

    return NextResponse.json({ jobId, job }, { status: 202 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Auto-clipping run failed' }, { status: 500 })
  }
}
