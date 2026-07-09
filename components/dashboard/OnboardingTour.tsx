'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface TourStep {
  target: string | null
  title: string
  body: string
}

const STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome to the Edit Bay',
    body: 'Slicer turns long streams into ranked, subtitled clips. Here is the sixty-second lay of the land.',
  },
  {
    target: '[data-tour="upload"]',
    title: 'Upload',
    body: 'Paste a YouTube, Twitch, or X link — or drop a video file. Slicer downloads, transcribes, and scores the strongest moments.',
  },
  {
    target: '[data-tour="clips"]',
    title: 'Streams',
    body: 'Every processed stream lands here with its ranked clips, ready to preview, vote on, and download.',
  },
  {
    target: '[data-tour="studio"]',
    title: 'Job Studio',
    body: 'Open any clip to trim it, style subtitles, and export. Example clips are already loaded so you can try it right away.',
  },
  {
    target: '[data-tour="autoclip"]',
    title: 'Auto-Clip',
    body: 'Subscribe to a channel and Slicer clips new VODs automatically as they appear.',
  },
  {
    target: '[data-tour="developer"]',
    title: 'API',
    body: 'Create keys to drive Slicer from your own tools and bots. That is the tour — your first upload is one paste away.',
  },
]

const SPOTLIGHT_PADDING = 6
const BUBBLE_WIDTH = 340

interface OnboardingTourProps {
  onComplete: () => void
}

export default function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const step = STEPS[stepIndex]
  const isLastStep = stepIndex === STEPS.length - 1

  const measure = useCallback(() => {
    setViewportWidth(window.innerWidth)
    if (!step.target) {
      setRect(null)
      return
    }
    const el = document.querySelector(step.target)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step.target])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  useEffect(() => {
    bubbleRef.current?.focus({ preventScroll: true })
  }, [stepIndex])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onComplete()
      if (event.key === 'ArrowRight' && stepIndex < STEPS.length - 1) setStepIndex((i) => i + 1)
      if (event.key === 'ArrowLeft' && stepIndex > 0) setStepIndex((i) => i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepIndex, onComplete])

  const bubbleStyle: React.CSSProperties = rect
    ? {
        top: rect.bottom + SPOTLIGHT_PADDING + 14,
        left: Math.min(
          Math.max(16, rect.left + rect.width / 2 - BUBBLE_WIDTH / 2),
          Math.max(16, viewportWidth - BUBBLE_WIDTH - 16),
        ),
      }
    : { top: '38%', left: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Slicer tour">
      {/* Backdrop — spotlight cutout via oversized box-shadow when a target exists */}
      {rect ? (
        <div
          className="tour-spotlight pointer-events-none fixed rounded-lg border border-[var(--mars)]"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(6, 4, 10, 0.78), 0 0 14px rgba(255, 90, 54, 0.55)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(6,4,10,0.78)]" />
      )}

      {/* Text bubble */}
      <div
        ref={bubbleRef}
        tabIndex={-1}
        className="liquid-card fixed p-5 outline-none"
        style={{ ...bubbleStyle, width: BUBBLE_WIDTH, maxWidth: 'calc(100vw - 32px)' }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="h-3 w-[3px] rounded-full bg-[var(--mars)]" />
          <span className="eyebrow">Tour {stepIndex + 1} / {STEPS.length}</span>
        </div>
        <div className="font-display text-xl font-bold uppercase tracking-wide text-dust">{step.title}</div>
        <p className="mt-1.5 text-sm leading-relaxed text-dust/60">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onComplete}
            className="text-xs font-mono uppercase tracking-[0.16em] text-dust/40 transition hover:text-dust/75"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="liquid-button rounded-lg border border-white/10 px-3.5 py-2 text-xs font-bold text-dust transition hover:border-white/25"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLastStep ? onComplete() : setStepIndex((i) => i + 1))}
              className="rounded-lg px-4 py-2 text-xs font-bold text-[#180703] transition hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #FF5A36, #FF7A5C)', boxShadow: '0 8px 20px rgba(255, 90, 54, 0.28)' }}
            >
              {isLastStep ? 'Start uploading' : 'Next'}
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
          {STEPS.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === stepIndex ? 'w-5 bg-[var(--mars)]' : 'w-1.5 bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
