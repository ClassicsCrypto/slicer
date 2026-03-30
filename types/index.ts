export type AIFocus =
  | 'funny_moments'
  | 'kill_streaks'
  | 'intense_action'
  | 'big_plays'
  | 'reactions'
  | 'key_dialogue'
  | 'hype_moments'
  | 'fails'

export type ClipLength = '15' | '30' | '45' | '60'

export type JobStatus = 'processing' | 'complete' | 'failed'

export interface SubtitleWord {
  text: string
  start: number  // seconds relative to clip start
  end: number    // seconds relative to clip start
}

export interface Clip {
  id: string
  job_id: string
  render_id: string
  r2_key: string
  duration: number
  start_time: number
  end_time: number
  matched_categories: AIFocus[]
  ai_reason: string
  virality_score?: number
  subtitles?: SubtitleWord[]
  created_at: string
}

export interface Job {
  id: string
  user_id: string
  title: string
  source_url: string
  status: JobStatus
  options: ProcessingOptions
  progress: Record<string, unknown>
  clips?: Clip[]
  created_at: string
}

export interface ProcessingOptions {
  clipCount: number
  clipLength: ClipLength
  aiFocus: AIFocus[]
  outputQuality: '720p' | '1080p'
  platformFormat: 'tiktok' | 'twitter' | 'youtube_shorts' | 'custom'
}
