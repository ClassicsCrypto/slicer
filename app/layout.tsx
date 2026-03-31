import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Slicer — AI Video Clips by Mars Cats Voyage',
  description: 'AI-powered video clipping for Mars Cats Voyage content.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
