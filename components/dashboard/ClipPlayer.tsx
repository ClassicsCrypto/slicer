'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clip, SubtitleWord, SubtitleOptions } from '@/types'
import { censorSubtitleWords } from '@/lib/subtitle-censor'

interface SubtitleCue {
  start: number
  end: number
  words: SubtitleWord[]
}

const SUBTITLE_FONT_FAMILIES: Record<string, string> = {
  impact: 'Impact, Arial Black, sans-serif',
  bebas: '"Bebas Neue", Impact, sans-serif',
  montserrat: '"Montserrat", Arial, sans-serif',
  sora: '"Sora", "Montserrat", sans-serif',
  arial_black: '"Arial Black", Arial, sans-serif',
  trebuchet: '"Trebuchet MS", sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, serif',
  times_new_roman: '"Times New Roman", serif',
}

function applyTextCase(text: string, textCase: SubtitleOptions['textCase'] = 'original') {
  if (textCase === 'upper') return text.toUpperCase()
  if (textCase === 'title') return text.replace(/\b\w/g, (char) => char.toUpperCase())
  return text
}

function normalizeSubtitleWords(words: SubtitleWord[] = []) {
  return [...words]
    .filter((word) => typeof word?.start === 'number' && typeof word?.end === 'number' && typeof word?.text === 'string')
    .sort((a, b) => (a.start - b.start) || (a.end - b.end))
}

function buildSubtitleCues(words: SubtitleWord[]): SubtitleCue[] {
  const orderedWords = normalizeSubtitleWords(words)
  if (orderedWords.length === 0) return []

  const cues: SubtitleCue[] = []
  let cursor = 0

  while (cursor < orderedWords.length) {
    const cueWords: SubtitleWord[] = [orderedWords[cursor]]
    const cueStart = orderedWords[cursor].start
    cursor += 1

    while (cursor < orderedWords.length) {
      const previous = cueWords[cueWords.length - 1]
      const next = orderedWords[cursor]
      const gap = next.start - previous.end
      const duration = next.end - cueStart
      if (previous.breakAfter || cueWords.length >= 6 || gap > 0.75 || duration > 3.2) break
      cueWords.push(next)
      cursor += 1
    }

    cues.push({
      start: cueWords[0].start,
      end: cueWords[cueWords.length - 1].end,
      words: cueWords,
    })
  }

  return cues
}

function SubtitleOverlay({
  words,
  currentTime,
  isPlaying,
  options,
}: {
  words: SubtitleWord[]
  currentTime: number
  isPlaying: boolean
  options: SubtitleOptions
}) {
  const fontSize = options.size === 'small' ? 'text-sm md:text-base' : options.size === 'large' ? 'text-xl md:text-2xl' : 'text-base md:text-lg'
  const activeColor = options.color && options.color !== 'custom' ? options.color : (options.customColor ?? '#ffffff')
  const outlineColor = options.outlineColor && options.outlineColor !== 'custom' ? options.outlineColor : (options.customOutlineColor ?? '#000000')
  const safeZone = options.safeZone || 'auto'
  const positionClass = safeZone === 'upper_safe' || options.position === 'top'
    ? 'top-[12%]'
    : safeZone === 'center_safe' || options.position === 'center'
      ? 'top-1/2 -translate-y-1/2'
      : 'bottom-[18%]'
  const fontFamily = SUBTITLE_FONT_FAMILIES[options.font || 'impact'] || SUBTITLE_FONT_FAMILIES.impact
  const subtitleMode = options.mode || (options.style === 'karaoke' ? 'karaoke' : 'phrase')
  const animationPreset = options.animationPreset || 'pop'
  const normalizedWords = useMemo(() => normalizeSubtitleWords(words), [words])
  const cues = useMemo(() => buildSubtitleCues(normalizedWords), [normalizedWords])

  const currentCue = useMemo(() => {
    for (let i = cues.length - 1; i >= 0; i -= 1) {
      const cue = cues[i]
      if (currentTime >= cue.start - 0.08 && currentTime <= cue.end + 0.55) {
        return cue
      }
    }
    return null
  }, [cues, currentTime])

  const currentWordIndex = useMemo(() => {
    if (!currentCue) return -1
    return currentCue.words.findIndex((word, index) => {
      const nextWord = currentCue.words[index + 1]
      const wordEnd = nextWord ? Math.max(word.end, nextWord.start - 0.02) : word.end + 0.18
      return currentTime >= word.start && currentTime <= wordEnd
    })
  }, [currentCue, currentTime])

  if (!isPlaying || !currentCue) return null

  const thickness = options.outlineThickness || 'medium'
  const px = thickness === 'none' ? 0 : thickness === 'thin' ? 1 : thickness === 'thick' ? 3 : 2
  const shadowParts: string[] = []
  if (px > 0) {
    shadowParts.push(
      `${-px}px ${-px}px 0 ${outlineColor}`,
      `${px}px ${-px}px 0 ${outlineColor}`,
      `${-px}px ${px}px 0 ${outlineColor}`,
      `${px}px ${px}px 0 ${outlineColor}`,
      `${-px - 1}px 0 0 ${outlineColor}`,
      `${px + 1}px 0 0 ${outlineColor}`,
      `0 ${-px - 1}px 0 ${outlineColor}`,
      `0 ${px + 1}px 0 ${outlineColor}`,
    )
  }
  if (options.shadow) shadowParts.push('2px 2px 4px rgba(0,0,0,0.7)')
  const textShadow = shadowParts.join(', ')
  const highlightColor = options.highlightColor || '#ffeb3b'
  const dimColor = 'rgba(255,255,255,0.32)'
  const spokenColor = 'rgba(255,255,255,0.9)'
  const textTransform = options.textCase === 'upper' ? 'uppercase' : options.textCase === 'title' ? 'capitalize' : 'none'
  const cueAnimationName = animationPreset === 'fade' ? 'subtitle-fade-in' : animationPreset === 'pop' ? 'subtitle-pop-in' : 'none'
  const cueAnimationStyle = cueAnimationName === 'none' ? undefined : `${cueAnimationName} ${animationPreset === 'fade' ? '260ms ease-out' : '180ms cubic-bezier(0.2, 0.9, 0.2, 1)'} both`
  const cueKey = subtitleMode === 'phrase'
    ? `${subtitleMode}-${currentCue.start}`
    : `${subtitleMode}-${currentCue.start}-${Math.max(currentWordIndex, 0)}`

  const getAnimatedStyle = (active: boolean) => {
    if (!active || animationPreset === 'none') {
      return { opacity: 1, transform: 'scale(1) translateY(0px)', filter: 'none' }
    }
    if (animationPreset === 'fade') {
      return { opacity: 1, transform: 'scale(1) translateY(0px)', filter: 'brightness(1.18)' }
    }
    return { opacity: 1, transform: 'scale(1.22) translateY(-3px)', filter: 'brightness(1.28)' }
  }

  const renderPhraseMode = () => (
    <div
      key={cueKey}
      className={`text-center ${fontSize} leading-relaxed`}
      style={{
        fontFamily,
        fontWeight: 700,
        letterSpacing: '0.03em',
        animation: cueAnimationStyle,
      }}
    >
      {currentCue.words.map((word, index) => (
        <span
          key={`${currentCue.start}-${index}`}
          style={{
            color: activeColor,
            textShadow,
            textTransform: textTransform as any,
          }}
        >
          {applyTextCase(word.text, options.textCase)}{' '}
        </span>
      ))}
    </div>
  )

  const renderActiveWordMode = () => (
    <div
      key={cueKey}
      className={`flex flex-wrap justify-center gap-x-2.5 gap-y-1.5 text-center ${fontSize}`}
      style={{
        fontFamily,
        fontWeight: 800,
        letterSpacing: '0.025em',
        animation: cueAnimationStyle,
      }}
    >
      {currentCue.words.map((word, index) => {
        const isActive = index === currentWordIndex
        const animatedStyle = getAnimatedStyle(isActive)
        const pillActive = isActive && (options.activeWordStyle || 'pill') === 'pill'
        return (
          <span
            key={`${currentCue.start}-${index}`}
            style={{
              color: isActive ? highlightColor : activeColor,
              background: pillActive ? 'rgba(255, 235, 59, 0.22)' : 'transparent',
              borderRadius: pillActive ? '0.42em' : 0,
              padding: pillActive ? '0.02em 0.2em' : 0,
              textDecoration: isActive && options.activeWordStyle === 'underline' ? `underline ${highlightColor} 0.12em` : 'none',
              textShadow,
              textTransform: textTransform as any,
              opacity: isActive ? animatedStyle.opacity : 1,
              transform: isActive ? animatedStyle.transform : 'scale(1)',
              filter: isActive ? animatedStyle.filter : 'none',
              transition: 'color 90ms ease, transform 120ms ease, background 120ms ease, filter 120ms ease',
              display: 'inline-flex',
              lineHeight: 1.1,
            }}
          >
            {applyTextCase(word.text, options.textCase)}
          </span>
        )
      })}
    </div>
  )

  const renderKaraokeMode = () => (
    <div
      key={cueKey}
      className={`flex flex-wrap justify-center gap-x-2.5 gap-y-1.5 text-center ${fontSize}`}
      style={{
        fontFamily,
        fontWeight: 700,
        letterSpacing: '0.025em',
        animation: cueAnimationStyle,
      }}
    >
      {currentCue.words.map((word, index) => {
        const isActive = index === currentWordIndex
        const isSpoken = index < currentWordIndex
        const animatedStyle = getAnimatedStyle(isActive)
        return (
          <span
            key={`${currentCue.start}-${index}`}
            style={{
              color: isActive ? highlightColor : isSpoken ? spokenColor : dimColor,
              textShadow,
              textTransform: textTransform as any,
              opacity: isActive ? animatedStyle.opacity : 1,
              transform: animatedStyle.transform,
              filter: animatedStyle.filter,
              transition: 'color 100ms ease, transform 120ms ease, opacity 120ms ease, filter 120ms ease',
              display: 'inline-flex',
              lineHeight: 1.1,
            }}
          >
            {applyTextCase(word.text, options.textCase)}
          </span>
        )
      })}
    </div>
  )

  const renderWordPopMode = () => {
    const activeWord = currentCue.words[Math.max(0, currentWordIndex)] || currentCue.words[0]
    const animatedStyle = getAnimatedStyle(true)
    return (
      <p
        key={cueKey}
        className={`text-center ${options.size === 'small' ? 'text-lg md:text-xl' : options.size === 'large' ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} leading-tight`}
        style={{
          fontFamily,
          fontWeight: 800,
          letterSpacing: '0.045em',
          color: activeColor,
          textShadow,
          textTransform: textTransform as any,
          transform: animatedStyle.transform,
          opacity: animatedStyle.opacity,
          filter: animatedStyle.filter,
          animation: cueAnimationStyle,
          transition: 'transform 120ms ease, opacity 120ms ease, filter 120ms ease',
        }}
      >
        {applyTextCase(activeWord.text, options.textCase)}
      </p>
    )
  }

  return (
    <div className={`absolute ${positionClass} left-0 right-0 flex justify-center pointer-events-none px-4`}>
      <div className="max-w-[90%]">
        {subtitleMode === 'word_pop'
          ? renderWordPopMode()
          : subtitleMode === 'active_word'
            ? renderActiveWordMode()
            : subtitleMode === 'karaoke'
              ? renderKaraokeMode()
              : renderPhraseMode()}
      </div>
    </div>
  )
}

interface ClipPlayerProps {
  clip: Clip
  sourceUrl: string
  subtitleOptions?: SubtitleOptions
  onTrimChange?: (start: number, end: number) => void
  onPlaybackTimeChange?: (time: number) => void
  externalSeekTime?: number | null
}

const DEFAULT_SUB_OPTS: SubtitleOptions = {
  enabled: true,
  size: 'medium',
  color: '#ffffff',
  position: 'bottom',
  style: 'bold',
  background: 'none',
  font: 'impact',
  mode: 'active_word',
  preset: 'auto',
  animationPreset: 'pop',
  highlightColor: '#ffeb3b',
  activeWordStyle: 'pill',
  safeZone: 'bottom_safe',
  textCase: 'original',
  watermarkEnabled: true,
}

export default function ClipPlayer({
  clip,
  sourceUrl,
  subtitleOptions,
  onTrimChange,
  onPlaybackTimeChange,
  externalSeekTime,
}: ClipPlayerProps) {
  const subOpts = subtitleOptions ?? DEFAULT_SUB_OPTS
  const displaySubtitles = useMemo(
    () => subOpts.profanityFilter ? censorSubtitleWords(clip.subtitles || []) : (clip.subtitles || []),
    [clip.subtitles, subOpts.profanityFilter],
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrubRef = useRef<HTMLDivElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const originalDuration = clip.end_time - clip.start_time
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(originalDuration)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)

  const trimmedDuration = Math.max(0.1, trimEnd - trimStart)
  const effectiveStart = clip.start_time + trimStart
  const effectiveEnd = clip.start_time + trimEnd

  useEffect(() => {
    onTrimChange?.(effectiveStart, effectiveEnd)
  }, [effectiveStart, effectiveEnd, onTrimChange])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.currentTime = effectiveStart
    setCurrentTime(trimStart)
    onPlaybackTimeChange?.(trimStart)

    const handleTimeUpdate = () => {
      if (video.currentTime >= effectiveEnd) {
        video.pause()
        video.currentTime = effectiveStart
        setIsPlaying(false)
        setCurrentTime(trimStart)
        onPlaybackTimeChange?.(trimStart)
        return
      }

      const nextTime = Math.max(trimStart, Math.min(trimEnd, video.currentTime - clip.start_time))
      setCurrentTime(nextTime)
      onPlaybackTimeChange?.(nextTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
    }
  }, [clip.start_time, effectiveEnd, effectiveStart, onPlaybackTimeChange, trimEnd, trimStart])

  useEffect(() => {
    if (externalSeekTime === null || externalSeekTime === undefined) return
    const video = videoRef.current
    if (!video) return

    const nextTime = Math.max(trimStart, Math.min(trimEnd, externalSeekTime))
    video.currentTime = clip.start_time + nextTime
    setCurrentTime(nextTime)
    onPlaybackTimeChange?.(nextTime)
  }, [clip.start_time, externalSeekTime, onPlaybackTimeChange, trimEnd, trimStart])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
      return
    }

    if (video.currentTime >= effectiveEnd || video.currentTime < effectiveStart) {
      video.currentTime = effectiveStart
      setCurrentTime(trimStart)
      onPlaybackTimeChange?.(trimStart)
    }
    video.play()
  }

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video || !scrubRef.current) return
    const rect = scrubRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newTime = trimStart + ratio * trimmedDuration
    video.currentTime = clip.start_time + newTime
    setCurrentTime(newTime)
    onPlaybackTimeChange?.(newTime)
  }

  const handleTrimDrag = (e: React.MouseEvent<HTMLDivElement>, handle: 'start' | 'end') => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(handle)

    const onMove = (ev: MouseEvent) => {
      if (!scrubRef.current) return
      const rect = scrubRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      const timePos = ratio * originalDuration

      if (handle === 'start') {
        setTrimStart(Math.min(timePos, trimEnd - 2))
      } else {
        setTrimEnd(Math.max(timePos, trimStart + 2))
      }
    }

    const onUp = () => {
      setDragging(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const video = videoRef.current
      if (video) {
        const seekTime = handle === 'start' ? Math.min(trimStart, trimEnd - 2) : Math.max(trimStart, trimEnd)
        video.currentTime = clip.start_time + seekTime
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const progress = trimmedDuration > 0 ? ((currentTime - trimStart) / trimmedDuration) * 100 : 0
  const trimStartPct = (trimStart / originalDuration) * 100
  const trimEndPct = (trimEnd / originalDuration) * 100
  const isTrimmed = trimStart > 0.1 || trimEnd < originalDuration - 0.1
  const relativeTime = Math.max(0, currentTime - trimStart)

  function fmt(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/10" style={{ background: '#0A0A0F' }}>
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={sourceUrl}
          className="w-full h-full object-contain"
          preload="metadata"
          playsInline
        />

        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause clip' : 'Play clip'}
          className={`absolute inset-0 z-20 flex items-center justify-center transition-colors ${
            isPlaying ? 'bg-transparent hover:bg-black/20' : 'bg-black/30 hover:bg-black/40'
          }`}
        >
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl text-white shadow-lg glow-red transition-opacity ${
              isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'
            }`}
            style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}
          >
            {isPlaying ? '❚❚' : '▶'}
          </span>
        </button>

        {subOpts.enabled && displaySubtitles.length > 0 && (
          <SubtitleOverlay
            words={displaySubtitles.filter((word) => word.end > trimStart && word.start < trimEnd)}
            currentTime={currentTime}
            isPlaying={isPlaying}
            options={subOpts}
          />
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        <div ref={scrubRef} className="relative h-8 select-none">
          <div className="absolute top-3 left-0 right-0 h-2 rounded-full bg-white/10" />

          <div
            className="absolute top-3 left-0 h-2 rounded-l-full bg-black/50"
            style={{ width: `${trimStartPct}%` }}
          />
          <div
            className="absolute top-3 right-0 h-2 rounded-r-full bg-black/50"
            style={{ width: `${100 - trimEndPct}%` }}
          />

          <div
            className="absolute top-3 h-2 cursor-pointer"
            style={{
              left: `${trimStartPct}%`,
              width: `${trimEndPct - trimStartPct}%`,
              background: 'rgba(255,255,255,0.15)',
            }}
            onClick={handleScrub}
          />

          <div
            className="absolute top-3 h-2 rounded-l-full pointer-events-none"
            style={{
              left: `${trimStartPct}%`,
              width: `${(progress / 100) * (trimEndPct - trimStartPct)}%`,
              background: 'linear-gradient(90deg, #FF4D4D, #FF6B6B)',
            }}
          />

          <div
            className={`absolute top-0 w-3 h-8 rounded-sm cursor-ew-resize transition-colors ${
              dragging === 'start' ? 'bg-red-400' : 'bg-white/70 hover:bg-white'
            }`}
            style={{ left: `calc(${trimStartPct}% - 6px)` }}
            onMouseDown={(e) => handleTrimDrag(e, 'start')}
            title="Drag to trim start"
          >
            <div className="absolute inset-x-0.5 top-2 bottom-2 border-x border-black/30" />
          </div>

          <div
            className={`absolute top-0 w-3 h-8 rounded-sm cursor-ew-resize transition-colors ${
              dragging === 'end' ? 'bg-red-400' : 'bg-white/70 hover:bg-white'
            }`}
            style={{ left: `calc(${trimEndPct}% - 6px)` }}
            onMouseDown={(e) => handleTrimDrag(e, 'end')}
            title="Drag to trim end"
          >
            <div className="absolute inset-x-0.5 top-2 bottom-2 border-x border-black/30" />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{fmt(relativeTime)}</span>
          <span className="text-white/20">
            {isTrimmed ? `trimmed: ${fmt(trimmedDuration)}` : `clip: ${fmt(originalDuration)}`}
          </span>
          <span>{fmt(trimmedDuration)}</span>
        </div>
      </div>
    </div>
  )
}
