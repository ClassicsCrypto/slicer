// Thin typed facade over the shared core so existing import paths keep
// working. The implementations (and the canonical profanity patterns — the
// server's, which decide what gets censored in exported video) live in
// lib/subtitle-core.js.
export {
  isProfaneSubtitleToken as isProfaneToken,
  emojiCensorWord,
  censorSubtitleWords,
} from '@/lib/subtitle-core'
