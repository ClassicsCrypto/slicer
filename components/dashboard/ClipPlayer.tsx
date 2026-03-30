'use client'

import { useEffect, useRef, useState } from 'react'
import { Clip } from '@/types'

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
