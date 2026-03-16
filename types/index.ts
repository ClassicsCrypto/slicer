export type JobStatus = 'pending' | 'processing' | 'complete' | 'failed'

export type ClipLength = '15' | '30' | '45' | '60' | '90' | 'custom'
export type DetectionMode = 'auto' | 'manual'
export type SubtitleStyle = 'bold' | 'clean' | 'shadow' | 'outline' | 'karaoke'
export type SubtitleSize = 'small' | 'medium' | 'large'
export type OutputQuality = '720p' | '1080p' | '4k'
export type PlatformFormat = 'tiktok' | 'twitter' | 'youtube_shorts' | 'custom'

export interface SubtitleOptions {
  enabled: boolean
  style: SubtitleStyle
  size: SubtitleSize
  color: string
  background: boolean
}

export interface ProcessingOptions {
  clipCount: number
  clipLength: ClipLength
  customClipLength?: number
  detectionMode: DetectionMode
  subtitles: SubtitleOptions
  outputQuality: OutputQuality
  platformFormat: PlatformFormat
}

export interface ProcessingProgress {
  uploading?: boolean | 'done'
  analyzing?: boolean | 'done'
  detecting?: boolean | 'done'
  subtitles?: boolean | 'done'
  rendering?: boolean | 'done'
  finalizing?: boolean | 'done'
  estimatedSecondsRemaining?: number
  error?: string
}

export interface Job {
  id: string
  user_id: string
  title: string | null
  source_url: string | null
  r2_key: string | null
  status: JobStatus
  options: ProcessingOptions | null
  progress: ProcessingProgress
  created_at: string
  updated_at: string
}

export interface Clip {
  id: string
  job_id: string
  user_id: string
  r2_key: string
  thumbnail_r2_key: string | null
  duration: number | null
  start_time: number | null
  end_time: number | null
  subtitle_track: SubtitleCue[] | null
  created_at: string
}

export interface SubtitleCue {
  start: number
  end: number
  text: string
}

export interface ConnectedAccount {
  platform: 'twitter' | 'youtube' | 'twitch' | 'tiktok' | 'instagram'
  connected: boolean
  username?: string
}

export interface UserSettings {
  defaultQuality: OutputQuality
  defaultFormat: PlatformFormat
  defaultSubtitleStyle: SubtitleStyle
  connectedAccounts: ConnectedAccount[]
}
