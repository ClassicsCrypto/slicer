'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Clip, SubtitleWord, SubtitleOptions } from '@/types'

/**
 * Groups words into display lines (~4-6 words each) and shows the
 * current line with word-level highlight animation.
 */
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
  const fontSize = options.size === 'small' ? 'text-xs' : options.size === 'large' ? 'text-lg md:text-xl' : 'text-sm md:text-base'
  const activeColor = options.color === 'custom' ? (options.customColor ?? '#FF4D4D') : options.color
  const positionClass = options.position === 'top' ? 'top-4' : options.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-8'
  // Font family matching FFmpeg export
  const fontFamily = options.font === 'bebas' ? '"Bebas Neue", Impact, sans-serif'
    : options.font === 'montserrat' ? '"Montserrat", Arial, sans-serif'
    : 'Impact, Arial Black, sans-serif'
  // Group words into lines of ~5 words
  const lines = useMemo(() => {
    const result: SubtitleWord[][] = []
    for (let i = 0; i < words.length; i += 5) {
      result.push(words.slice(i, i + 5))
    }
    return result
  }, [words])

  // Find current line based on playback time
  const currentLine = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (line.length > 0 && currentTime >= line[0].start - 0.1) {
        // Check if we haven't passed this line entirely
        const lastWord = line[line.length - 1]
        if (currentTime <= lastWord.end + 1.0) {
          return { index: i, words: line }
        }
      }
    }
    return null
  }, [lines, currentTime])

  if (!isPlaying || !currentLine) return null

  // Match FFmpeg export: bold text with black outline (BorderStyle=1, Outline=2)
  const textStroke = '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, -1px 0 0 #000, 1px 0 0 #000, 0 -1px 0 #000, 0 1px 0 #000, 1px 1px 2px rgba(0,0,0,0.5)'

  return (
    <div className={`absolute ${positionClass} left-0 right-0 flex justify-center pointer-events-none px-4`}>
      <div className="max-w-[90%]">
        <p className={`text-center ${fontSize} font-bold leading-relaxed`} style={{ fontFamily }}>
          {currentLine.words.map((word, i) => (
            <span
              key={`${currentLine.index}-${i}`}
              style={{
                color: activeColor,
                textShadow: textStroke,
              }}
            >
              {word.text}{' '}
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}

interface ClipPlayerProps {
  clip: Clip
  sourceUrl: string
  subtitleOptions?: SubtitleOptions
}

const DEFAULT_SUB_OPTS: SubtitleOptions = {
  enabled: true, size: 'medium', color: '#ffffff',
  position: 'bottom', style: 'bold', background: 'none', font: 'impact',
}

export default function ClipPlayer({ clip, sourceUrl, subtitleOptions }: ClipPlayerProps) {
  const subOpts = subtitleOptions ?? DEFAULT_SUB_OPTS
  const videoRef = useRef<HTMLVideoElement>(null)
  const scrubRef = useRef<HTMLDivElement>(null)
  const [currentRelative, setCurrentRelative] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  
  // Trim state — relative to original clip boundaries (0 to duration)
  const originalDuration = clip.end_time - clip.start_time
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(originalDuration)
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null)
  
  const trimmedDuration = trimEnd - trimStart
  const effectiveStart = clip.start_time + trimStart
  const effectiveEnd = clip.start_time + trimEnd

  // Enforce start/end boundaries using trim handles
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.currentTime = effectiveStart

    const handleTimeUpdate = () => {
      if (video.currentTime >= effectiveEnd) {
        video.pause()
        video.currentTime = effectiveStart
        setIsPlaying(false)
        setCurrentRelative(0)
        return
      }
      setCurrentRelative(video.currentTime - effectiveStart)
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
  }, [effectiveStart, effectiveEnd])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
    } else {
      if (video.currentTime >= effectiveEnd || video.currentTime < effectiveStart) {
        video.currentTime = effectiveStart
      }
      video.play()
    }
  }

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video || !scrubRef.current) return
    const rect = scrubRef.current.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    // Scrub within trimmed range
    const newTime = effectiveStart + ratio * trimmedDuration
    video.currentTime = newTime
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
        setTrimStart(Math.min(timePos, trimEnd - 2)) // min 2s clip
      } else {
        setTrimEnd(Math.max(timePos, trimStart + 2)) // min 2s clip
      }
    }
    
    const onUp = () => {
      setDragging(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // Seek to new start if needed
      const video = videoRef.current
      if (video && handle === 'start') {
        video.currentTime = clip.start_time + trimStart
      }
    }
    
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const progress = trimmedDuration > 0 ? (currentRelative / trimmedDuration) * 100 : 0
  const trimStartPct = (trimStart / originalDuration) * 100
  const trimEndPct = (trimEnd / originalDuration) * 100
  const isTrimmed = trimStart > 0.1 || trimEnd < originalDuration - 0.1

  function fmt(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="rounded-xl overflow-hidden border border-white/10" style={{ background: '#0A0A0F' }}>
      {/* Video */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={sourceUrl}
          className="w-full h-full object-contain"
          preload="metadata"
          playsInline
        />

        {/* Play button overlay */}
        {!isPlaying && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl shadow-lg glow-red"
              style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}
            >
              ▶
            </div>
          </button>
        )}

        {/* Click to pause when playing */}
        {isPlaying && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 bg-transparent"
          />
        )}

        {/* Animated subtitles */}
        {subOpts.enabled && clip.subtitles && clip.subtitles.length > 0 && (
          <SubtitleOverlay
            words={clip.subtitles}
            currentTime={currentRelative}
            isPlaying={isPlaying}
            options={subOpts}
          />
        )}
      </div>

      {/* Controls with trim handles */}
      <div className="px-4 py-3 space-y-2">
        {/* Trim scrubber */}
        <div ref={scrubRef} className="relative h-8 select-none">
          {/* Background track */}
          <div className="absolute top-3 left-0 right-0 h-2 rounded-full bg-white/10" />
          
          {/* Dimmed regions outside trim */}
          <div
            className="absolute top-3 left-0 h-2 rounded-l-full bg-black/50"
            style={{ width: `${trimStartPct}%` }}
          />
          <div
            className="absolute top-3 right-0 h-2 rounded-r-full bg-black/50"
            style={{ width: `${100 - trimEndPct}%` }}
          />
          
          {/* Active trim region */}
          <div
            className="absolute top-3 h-2 cursor-pointer"
            style={{
              left: `${trimStartPct}%`,
              width: `${trimEndPct - trimStartPct}%`,
              background: 'rgba(255,255,255,0.15)',
            }}
            onClick={handleScrub}
          />
          
          {/* Playback progress */}
          <div
            className="absolute top-3 h-2 rounded-l-full pointer-events-none"
            style={{
              left: `${trimStartPct}%`,
              width: `${(progress / 100) * (trimEndPct - trimStartPct)}%`,
              background: 'linear-gradient(90deg, #FF4D4D, #FF6B6B)',
            }}
          />
          
          {/* Start trim handle */}
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
          
          {/* End trim handle */}
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

        {/* Time display */}
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{fmt(currentRelative)}</span>
          <span className="text-white/20">
            {isTrimmed ? `trimmed: ${fmt(trimmedDuration)}` : `clip: ${fmt(originalDuration)}`}
          </span>
          <span>{fmt(trimmedDuration)}</span>
        </div>
      </div>
    </div>
  )
}
