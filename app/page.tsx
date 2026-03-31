import Link from 'next/link'
import Image from 'next/image'

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#0A0A0F' }}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #FF4D4D, transparent)' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 text-center max-w-2xl">
        {/* Logo */}
        <div className="animate-float">
          <Image
            src="/mcv-logo.jpg"
            alt="Mars Cats Voyage"
            width={120}
            height={120}
            className="rounded-full drop-shadow-[0_0_24px_rgba(255,77,77,0.5)]"
          />
        </div>

        {/* Title */}
        <div>
          <h1 className="text-6xl font-black tracking-tight mb-3">
            <span className="text-gradient-red">SLICER</span>
          </h1>
          <p className="text-xl text-white/60 font-medium">
            AI-powered video clips for Mars Cats Voyage
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 w-full mt-2">
          {[
            { icon: '🤖', label: 'AI Analysis', desc: 'Groq Llama scores your best moments' },
            { icon: '⚡', label: 'Instant Clips', desc: 'No rendering wait — clips in seconds' },
            { icon: '🎯', label: 'Viral Focus', desc: 'Highlights kills, fails, hype & more' },
          ].map((f) => (
            <div
              key={f.label}
              className="rounded-xl p-4 border border-white/10 text-left"
              style={{ background: '#15151F' }}
            >
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-sm font-semibold text-white mb-1">{f.label}</div>
              <div className="text-xs text-white/40">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="mt-2 px-10 py-4 rounded-xl font-bold text-lg text-white transition-all hover:scale-105 glow-red"
          style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}
        >
          Get Started →
        </Link>

        <p className="text-white/30 text-sm">Internal tool — Mars Cats Voyage</p>
      </div>
    </main>
  )
}
