/**
 * Single source of truth for subtitle word normalization, cue grouping,
 * profanity censoring, and default styling options.
 *
 * The implementations were moved VERBATIM from server/youtube-api.js — the
 * server's burned-in export output is the canonical behavior, so any change
 * here changes rendered videos. The browser preview (ClipPlayer), the
 * transcript editor (ClipPreviewEditor), the parity harness, and the export
 * path all consume these same functions so they can no longer drift.
 *
 * Plain CommonJS on purpose: server/youtube-api.js requires it directly, and
 * the adjacent subtitle-core.d.ts makes it importable from TS/TSX via '@/'.
 */

const MAX_WORDS_PER_CUE = 6
const MAX_GAP_S = 0.75
const MAX_CUE_DURATION_S = 3.2

const CURSE_EMOJIS = ['🤬', '😼', '💥', '🙀']

// Canonical patterns are the server's (note the u* variants, e.g. f+u*c+k+):
// they decide what gets censored in exported/burned video. The old browser
// copy used u+ — strictly narrower — which let "fck"-style spellings render
// censored on export but uncensored in preview.
const PROFANITY_PATTERNS = [
  /^f+u*c+k+(?:er|ers|ed|ing)?$/i,
  /^s+h+i+t+(?:ty|ting|ted)?$/i,
  /^b+i+t+c+h+(?:es|ing)?$/i,
  /^a+s+s+(?:hole|holes)?$/i,
  /^d+a+m+n+(?:ed|ing)?$/i,
  /^c+r+a+p+$/i,
  /^b+a+s+t+a+r+d+s?$/i,
  /^d+i+c+k+s?$/i,
  /^p+i+s+s+(?:ed|ing)?$/i,
  /^c+u+n+t+s?$/i,
  /^m+o+t+h+e+r+f+u*c+k+e*r*s?$/i,
]

function normalizeSubtitleWords(words = []) {
  return [...words]
    .filter((word) => typeof word?.start === 'number' && typeof word?.end === 'number' && typeof word?.text === 'string')
    .map((word) => ({
      ...word,
      start: Math.max(0, word.start),
      end: Math.max(0, word.end),
    }))
    .filter((word) => word.end > word.start)
    .sort((a, b) => (a.start - b.start) || (a.end - b.end))
}

function isProfaneSubtitleToken(text = '') {
  const normalized = String(text).toLowerCase().replace(/[^a-z0-9]/g, '')
  return Boolean(normalized) && PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized))
}

function emojiCensorWord(text = '', index = 0) {
  if (!isProfaneSubtitleToken(text)) return text
  return CURSE_EMOJIS[index % CURSE_EMOJIS.length]
}

function censorSubtitleWords(words = []) {
  let hitIndex = 0
  return words.map((word) => {
    if (!isProfaneSubtitleToken(word.text || '')) return word
    const text = CURSE_EMOJIS[hitIndex % CURSE_EMOJIS.length]
    hitIndex += 1
    return { ...word, text }
  })
}

function groupSubtitleWords(words) {
  const orderedWords = normalizeSubtitleWords(Array.isArray(words) ? words : [])
  if (orderedWords.length === 0) return []

  const groups = []
  let cursor = 0

  while (cursor < orderedWords.length) {
    const group = [orderedWords[cursor]]
    const groupStart = orderedWords[cursor].start
    cursor += 1

    while (cursor < orderedWords.length) {
      const previous = group[group.length - 1]
      const next = orderedWords[cursor]
      const gap = next.start - previous.end
      const duration = next.end - groupStart
      if (previous.breakAfter || group.length >= MAX_WORDS_PER_CUE || gap > MAX_GAP_S || duration > MAX_CUE_DURATION_S) break
      group.push(next)
      cursor += 1
    }

    groups.push(group)
  }

  return groups
}

// Values match every runtime fallback that existed before consolidation
// (server export defaults, ClipPlayer fallback, harness base). Call sites
// that deliberately differ (e.g. outlineThickness: 'thick' in AutoClip and
// the gallery) spread this and override that one key, so the difference is
// visible instead of buried in a 22-line copy.
const DEFAULT_SUBTITLE_OPTIONS = {
  enabled: true,
  size: 'medium',
  color: '#ffffff',
  position: 'bottom',
  style: 'bold',
  background: 'none',
  backgroundColor: '#000000',
  backgroundOpacity: 45,
  font: 'impact',
  mode: 'active_word',
  preset: 'auto',
  animationPreset: 'none',
  highlightColor: '#ffeb3b',
  activeWordStyle: 'pill',
  safeZone: 'bottom_safe',
  outlineThickness: 'medium',
  outlineColor: '#000000',
  shadow: true,
  textCase: 'original',
  watermarkEnabled: true,
}

module.exports = {
  MAX_WORDS_PER_CUE,
  MAX_GAP_S,
  MAX_CUE_DURATION_S,
  CURSE_EMOJIS,
  PROFANITY_PATTERNS,
  normalizeSubtitleWords,
  isProfaneSubtitleToken,
  emojiCensorWord,
  censorSubtitleWords,
  groupSubtitleWords,
  DEFAULT_SUBTITLE_OPTIONS,
}
