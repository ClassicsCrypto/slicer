'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Clip, SubtitleWord } from '@/types'

/**
 * Groups words into display lines (~4-6 words each) and shows the
 * current line with word-level highlight animation.
 */
function SubtitleOverlay({
  words,
  currentTime,
  isPlaying,
}: {
  words: SubtitleWord[]
  currentTime: number
  isPlaying: boolean
}) {
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

  return (
    <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none px-4">
      <div className="bg-black/70 backdrop-blur-sm rounded-lg px-4 py-2 max-w-[90%]">
        <p className="text-center text-sm md:text-base font-bold leading-relaxed">
          {currentLine.words.map((word, i) => {
            const isActive = currentTime >= word.start - 0.05
            const isHighlighted = currentTime >= word.start - 0.05 && currentTime <= word.end + 0.3
            return (
              <span
                key={`${currentLine.index}-${i}`}
                className="transition-all duration-150"
                style={{
                  color: isHighlighted ? '#FF4D4D' : isActive ? '#ffffff' : 'rgba(255,255,255,0.4)',
                  textShadow: isHighlighted ? '0 0 12px rgba(255,77,77,0.6)' : 'none',
                }}
              >
                {word.text}{' '}
              </span>
            )
          })}
        </p>
      </div>
    </div>
  )
}

interface ClipPlayerProps {
  clip: Clip
  sourceUrl: string
}

export default function ClipPlayer({ clip, sourceUrl }: ClipPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentRelative, setCurrentRelative] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const duration = clip.end_time - clip.start_time

  // Enforce start/end boundaries
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.currentTime = clip.start_time

    const handleTimeUpdate = () => {
      if (video.currentTime >= clip.end_time) {
        video.pause()
        video.currentTime = clip.start_time
        setIsPlaying(false)
        setCurrentRelative(0)
        return
      }
      setCurrentRelative(video.currentTime - clip.start_time)
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
  }, [clip.start_time, clip.end_time])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
    } else {
      if (video.currentTime >= clip.end_time) {
        video.currentTime = clip.start_time
      }
      video.play()
    }
  }

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    const newTime = clip.start_time + ratio * duration
    video.currentTime = Math.max(clip.start_time, Math.min(clip.end_time, newTime))
  }

  const progress = duration > 0 ? (currentRelative / duration) * 100 : 0

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
        {clip.subtitles && clip.subtitles.length > 0 && (
          <SubtitleOverlay
            words={clip.subtitles}
            currentTime={currentRelative}
            isPlaying={isPlaying}
          />
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 space-y-2">
        {/* Scrubber */}
        <div
          className="h-1.5 rounded-full bg-white/10 cursor-pointer overflow-hidden"
          onClick={handleScrub}
        >
          <div
            className="h-full rounded-full transition-none"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #FF4D4D, #FF6B6B)',
            }}
          />
        </div>

        {/* Time display */}
        <div className="flex items-center justify-between text-xs text-white/40">
          <span>{fmt(currentRelative)}</span>
          <span className="text-white/20">clip: {fmt(duration)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  )
}
