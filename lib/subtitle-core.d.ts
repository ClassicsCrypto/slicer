import type { SubtitleOptions, SubtitleWord } from '@/types'

export declare const MAX_WORDS_PER_CUE: number
export declare const MAX_GAP_S: number
export declare const MAX_CUE_DURATION_S: number
export declare const CURSE_EMOJIS: string[]
export declare const PROFANITY_PATTERNS: RegExp[]

export declare function normalizeSubtitleWords<T extends SubtitleWord>(words?: T[]): T[]
export declare function isProfaneSubtitleToken(text?: string): boolean
export declare function emojiCensorWord(text?: string, index?: number): string
export declare function censorSubtitleWords<T extends SubtitleWord>(words?: T[]): T[]
export declare function groupSubtitleWords<T extends SubtitleWord>(words?: T[]): T[][]

export declare const DEFAULT_SUBTITLE_OPTIONS: SubtitleOptions
