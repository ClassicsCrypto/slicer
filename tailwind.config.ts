import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00BFA5',
        accent: '#00E676',
        background: '#0A0E1A',
        surface: '#111827',
        muted: '#9CA3AF',
      },
      animation: {
        marquee: 'marquee 30s linear infinite',
        'cat-float': 'catFloat 3s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        catFloat: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glowPulse: {
          '0%, 100%': { filter: 'drop-shadow(0 0 8px #00BFA5)' },
          '50%': { filter: 'drop-shadow(0 0 24px #00E676)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
