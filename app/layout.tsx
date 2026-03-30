import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Slicer — AI Video Clips by Mars Cats Voyage',
  description: 'AI-powered video clipping for Mars Cats Voyage content.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
