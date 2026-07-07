'use client'

import { useEffect, useState } from 'react'

const FPS = 24

function formatTimecode(totalFrames: number): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const frames = totalFrames % FPS
  const totalSeconds = Math.floor(totalFrames / FPS)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600) % 100
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
}

/** Live session timecode ticking at 24fps; stays at zero when reduced motion is set. */
export default function Timecode() {
  const [frames, setFrames] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const startedAt = performance.now()
    let raf = 0
    const tick = (now: number) => {
      setFrames(Math.floor(((now - startedAt) / 1000) * FPS))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <span>{formatTimecode(frames)}</span>
}
