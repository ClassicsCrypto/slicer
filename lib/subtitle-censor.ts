import { SubtitleWord } from '@/types'

const CURSE_EMOJIS = ['🤬', '😼', '💥', '🙀']

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
  /^m+o+t+h+e+r+f+u+c+k+e*r*s?$/i,
]

function normalizeToken(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isProfaneToken(text: string) {
  const normalized = normalizeToken(text)
  if (!normalized) return false
  return PROFANITY_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function emojiCensorWord(text: string, index = 0) {
  if (!isProfaneToken(text)) return text
  return CURSE_EMOJIS[index % CURSE_EMOJIS.length]
}

export function censorSubtitleWords(words: SubtitleWord[] = []) {
  let hitIndex = 0
  return words.map((word) => {
    if (!isProfaneToken(word.text || '')) return word
    const text = emojiCensorWord(word.text || '', hitIndex)
    hitIndex += 1
    return { ...word, text }
  })
}
