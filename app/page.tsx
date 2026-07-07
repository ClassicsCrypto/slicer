import Image from 'next/image'
import type { CSSProperties } from 'react'
import LoginPanel from '@/components/auth/LoginPanel'
import Timecode from '@/components/landing/Timecode'

// Each letter sits in its own filmstrip frame; offsets make the strip read as spliced cuts
const WORDMARK = [
  { letter: 'S', cut: '0px' },
  { letter: 'L', cut: '4px' },
  { letter: 'I', cut: '-3px' },
  { letter: 'C', cut: '2px' },
  { letter: 'E', cut: '-4px' },
  { letter: 'R', cut: '3px' },
]

const PIPELINE = [
  {
    tag: 'Scout',
    title: 'AI analysis',
    desc: 'Local Whisper and Gemini read the footage and flag the strongest moments.',
  },
  {
    tag: 'Cache',
    title: 'Fast reruns',
    desc: 'Cached downloads and transcripts keep repeat passes quick.',
  },
  {
    tag: 'Output',
    title: 'Smarter picks',
    desc: 'Action-first clip ranking, subtitles, and export-ready cuts.',
  },
]

export default function LandingPage() {
  return (
    <main
      className="relative min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{
        background:
          'radial-gradient(ellipse at 50% 118%, rgba(255,90,54,0.14), transparent 55%), radial-gradient(circle at 8% 4%, rgba(47,230,200,0.05), transparent 30%), #0A0911',
      }}
    >
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center gap-9 text-center">
        {/* Mission patch */}
        <div className="flex flex-col items-center gap-4">
          <div className="animate-float">
            <Image
              src="/mcv-logo-official.png"
              alt="Mars Cats Voyage"
              width={96}
              height={96}
              priority
              className="object-contain drop-shadow-[0_0_20px_rgba(255,90,54,0.45)]"
            />
          </div>
          <p className="eyebrow">Mars Cats Voyage · Edit Bay</p>
        </div>

        {/* Sliced filmstrip wordmark */}
        <div className="flex flex-col items-center gap-5">
          <h1 className="slice-strip" aria-label="Slicer">
            {WORDMARK.map(({ letter, cut }, index) => (
              <span
                key={index}
                aria-hidden
                className="slice-cell"
                style={{ '--i': index, '--cut': cut } as CSSProperties}
              >
                {letter}
              </span>
            ))}
            <span aria-hidden className="playhead" />
          </h1>

          <div className="flex items-center gap-3 text-[11px] text-dust/40">
            <span className="h-px w-12 bg-dust/15" />
            <span className="tc-readout">
              TC <Timecode />
            </span>
            <span className="h-px w-12 bg-dust/15" />
          </div>

          <p className="text-lg text-dust/60 sm:text-xl">
            AI-powered video clips for Mars Cats Voyage
          </p>
        </div>

        {/* Pipeline cards */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {PIPELINE.map((step) => (
            <div key={step.tag} className="liquid-card p-5 text-left">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-3 w-[3px] rounded-full bg-[var(--mars)]" />
                <span className="eyebrow">{step.tag}</span>
              </div>
              <div className="mb-1 font-display text-2xl font-bold uppercase tracking-wide text-dust">
                {step.title}
              </div>
              <div className="text-xs leading-relaxed text-dust/45">{step.desc}</div>
            </div>
          ))}
        </div>

        {/* Auth */}
        <LoginPanel />

        <p className="text-sm text-dust/30">
          Sign in with an email code or a wallet. Google and Discord sign-in are on the way.
        </p>
      </div>
    </main>
  )
}
