import Image from 'next/image'
import LoginPanel from '@/components/auth/LoginPanel'

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'radial-gradient(circle at 50% 10%, rgba(255,77,77,0.12), transparent 28%), radial-gradient(circle at 12% 80%, rgba(0,191,165,0.08), transparent 26%), #0A0A0F' }}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #FF4D4D, transparent)' }} />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 text-center max-w-2xl">
        {/* Logo */}
        <div className="animate-float">
          <Image
            src="/mcv-logo-official.png"
            alt="Mars Cats Voyage"
            width={128}
            height={128}
            className="object-contain drop-shadow-[0_0_24px_rgba(255,77,77,0.5)]"
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
            { icon: '🤖', label: 'AI Analysis', desc: 'Local Whisper + Gemini scout the strongest moments' },
            { icon: '⚡', label: 'Fast Reruns', desc: 'Cached downloads and transcripts keep repeat passes quick' },
            { icon: '🎯', label: 'Smarter Picks', desc: 'Action-first clip ranking, subtitles, and export-ready cuts' },
          ].map((f) => (
            <div
              key={f.label}
              className="liquid-card rounded-xl p-4 text-left"
            >
              <div className="text-2xl mb-2">{f.icon}</div>
              <div className="text-sm font-semibold text-white mb-1">{f.label}</div>
              <div className="text-xs text-white/40">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Auth */}
        <LoginPanel />

        <p className="text-white/30 text-sm">Slicer accounts support Google, Discord, and wallet sign-in.</p>
      </div>
    </main>
  )
}
