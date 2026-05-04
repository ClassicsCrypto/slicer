export type DetectionMode = 'default' | 'gaming' | 'funny' | 'conversation'

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
export type JobPhase = 'queued' | 'uploading' | 'downloading' | 'transcribing' | 'analyzing' | 'scoring' | 'complete' | 'failed'
export type JobInputKind = 'remote_url' | 'uploaded_file' | 'rescore'

export interface SubtitleWord {
  text: string
  start: number  // seconds relative to clip start
  end: number    // seconds relative to clip start
  breakAfter?: boolean
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
  proof_frames?: ProofFrame[]
  vote?: ClipVote
  created_at: string
}

export type ClipVoteValue = 'up' | 'down' | 'neutral'

export interface ClipVote {
  value: ClipVoteValue
  reason?: string
  note?: string
  voted_at: string
}

export interface ProofFrame {
  label: 'best' | 'action' | 'clean'
  timestamp: number
  score: number
  reason: string
}

export interface JobProgress {
  phase?: JobPhase
  inputKind?: JobInputKind
  progress?: string
  streamContext?: string
  requestedClipCount?: number
  shortlistClipCount?: number
  aiReturnedClipCount?: number
  duplicateClipsRemoved?: number
  deliveredClipCount?: number
  clipShortfallReason?: string
  transcriptWordCount?: number
  volumeSpikeCount?: number
  transcriptionCached?: boolean
  transcriptionCacheKey?: string
  processingStartedAt?: string
  completedAt?: string
  scoreRunId?: string
  completedClips?: Clip[]
  clipVoteStats?: {
    up: number
    down: number
    neutral: number
  }
  rawInputUrl?: string
  sourceReady?: boolean
}

export interface Job {
  id: string
  user_id: string
  title: string
  source_url: string
  status: JobStatus
  options: ProcessingOptions
  progress: JobProgress
  clips?: Clip[]
  created_at: string
}

export type SubtitleSize = 'small' | 'medium' | 'large'
export type SubtitleColor = string
export type SubtitlePosition = 'bottom' | 'center' | 'top'
export type SubtitleSafeZone = 'auto' | 'bottom_safe' | 'center_safe' | 'upper_safe' | 'custom'
export type SubtitleStyle = 'bold' | 'outline' | 'shadow' | 'karaoke'
export type SubtitleBackground = 'none' | 'blur' | 'solid' | 'rounded_box' | 'active_word_pill'
export type SubtitleFont = 'impact' | 'bebas' | 'montserrat' | 'sora' | 'arial_black' | 'trebuchet' | 'verdana' | 'georgia' | 'times_new_roman'
export type SubtitleMode = 'phrase' | 'word_pop' | 'karaoke' | 'active_word'
export type SubtitleAnimationPreset = 'none' | 'fade' | 'pop'
export type SubtitlePreset = 'auto' | 'clean_tiktok' | 'gaming_pop' | 'hormozi_highlight' | 'mcv_branded' | 'meme_bold' | 'minimal_white'
export type ActiveWordStyle = 'color' | 'scale' | 'pill' | 'underline'
export type SubtitleOutlineThickness = 'none' | 'thin' | 'medium' | 'thick'
export type SubtitleOutlineColor = string
export type SubtitleCase = 'upper' | 'title' | 'original'

export interface SubtitleOptions {
  enabled: boolean
  size: SubtitleSize
  color: SubtitleColor
  customColor?: string
  position: SubtitlePosition
  safeZone?: SubtitleSafeZone
  style: SubtitleStyle
  background: SubtitleBackground
  font?: SubtitleFont
  mode?: SubtitleMode
  preset?: SubtitlePreset
  animationPreset?: SubtitleAnimationPreset
  highlightColor?: string
  activeWordStyle?: ActiveWordStyle
  autoKeywords?: boolean
  outlineThickness?: SubtitleOutlineThickness
  outlineColor?: SubtitleOutlineColor
  customOutlineColor?: string
  shadow?: boolean
  textCase?: SubtitleCase
  watermarkEnabled?: boolean
  profanityFilter?: boolean
  brandKitName?: string
}

export interface ProcessingOptions {
  clipCount: number
  clipLength: ClipLength
  detectionMode: DetectionMode
  aiFocus: AIFocus[]
  priorityHint?: string
  outputQuality: '720p' | '1080p'
  platformFormat: 'tiktok' | 'twitter' | 'youtube_shorts' | 'custom'
  subtitles: SubtitleOptions
  customGame?: string  // Optional: override auto-detected game context
}
