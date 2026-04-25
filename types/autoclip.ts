export type AutoclipPlatform = 'twitch' | 'youtube' | 'x' | 'direct'
export type AutoclipSubscriptionStatus = 'active' | 'paused'

export interface AutoclipSubscriptionInput {
  ownerName?: string
  ownerEmail?: string
  platform: AutoclipPlatform
  handle?: string
  channelUrl?: string
  title?: string
  options?: any
}

export interface AutoclipSubscription extends AutoclipSubscriptionInput {
  id: string
  status: AutoclipSubscriptionStatus
  lastCheckedAt?: string | null
  lastSeenStreamId?: string | null
  lastJobId?: string | null
  createdAt: string
  updatedAt: string
}
