import Hero from '@/components/landing/Hero'
import FeatureMarquee from '@/components/landing/FeatureMarquee'
import SocialLogin from '@/components/landing/SocialLogin'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-gradient tracking-tight">✂️ Slicer</span>
          <span className="text-xs text-muted font-medium ml-2 border border-primary/30 rounded-full px-2 py-0.5">by MCV</span>
        </div>
        <a
          href="#login"
          className="text-sm font-semibold text-primary hover:text-accent transition-colors"
        >
          Sign in →
        </a>
      </header>

      {/* Hero */}
      <Hero />

      {/* Feature Marquee */}
      <FeatureMarquee />

      {/* Login section */}
      <section id="login" className="flex flex-col items-center justify-center px-4 py-20">
        <div className="w-full max-w-md bg-surface rounded-2xl border border-white/5 p-8 shadow-xl glow-teal">
          <h2 className="text-2xl font-bold text-center mb-2">Start Clipping Today</h2>
          <p className="text-muted text-center text-sm mb-8">Free. No credit card required.</p>
          <SocialLogin />
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-muted text-sm">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">✂️ Slicer</span>
          <span className="text-muted/60">·</span>
          <span>by Mars Cats Voyage</span>
        </div>
        <div className="flex gap-6">
          <span className="hover:text-primary cursor-pointer transition-colors">Terms</span>
          <span className="hover:text-primary cursor-pointer transition-colors">Privacy</span>
          <a href="https://twitter.com/MarsCatsVoyage" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
            Twitter/X
          </a>
          <a href="https://discord.gg/marscats" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
            Discord
          </a>
        </div>
        <p className="text-muted/50 text-xs">© 2024 Mars Cats Voyage. All rights reserved.</p>
      </footer>
    </div>
  )
}
