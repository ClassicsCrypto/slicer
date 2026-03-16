'use client'

import React from 'react'

export default function Hero() {
  return (
    <section className="relative flex flex-col items-center justify-center text-center px-4 py-20 md:py-32 overflow-hidden">
      {/* Background glow blobs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-accent/5 blur-2xl pointer-events-none" />

      {/* MCV Cat SVG */}
      <div className="mb-8 cat-float glow-pulse">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Cat body */}
          <ellipse cx="60" cy="75" rx="30" ry="28" fill="#00BFA5" fillOpacity="0.15" stroke="#00BFA5" strokeWidth="1.5"/>
          {/* Cat head */}
          <circle cx="60" cy="45" r="22" fill="#00BFA5" fillOpacity="0.2" stroke="#00BFA5" strokeWidth="1.5"/>
          {/* Left ear */}
          <polygon points="42,28 36,10 52,22" fill="#00BFA5" stroke="#00BFA5" strokeWidth="1.5" strokeLinejoin="round"/>
          {/* Right ear */}
          <polygon points="78,28 84,10 68,22" fill="#00BFA5" stroke="#00BFA5" strokeWidth="1.5" strokeLinejoin="round"/>
          {/* Inner ear left */}
          <polygon points="43,26 38,14 50,23" fill="#00E676" fillOpacity="0.4"/>
          {/* Inner ear right */}
          <polygon points="77,26 82,14 70,23" fill="#00E676" fillOpacity="0.4"/>
          {/* Eyes */}
          <ellipse cx="53" cy="43" rx="4" ry="5" fill="#00E676"/>
          <ellipse cx="67" cy="43" rx="4" ry="5" fill="#00E676"/>
          <ellipse cx="53" cy="44" rx="1.5" ry="3" fill="#0A0E1A"/>
          <ellipse cx="67" cy="44" rx="1.5" ry="3" fill="#0A0E1A"/>
          {/* Eye shine */}
          <circle cx="54.5" cy="42" r="1" fill="white"/>
          <circle cx="68.5" cy="42" r="1" fill="white"/>
          {/* Nose */}
          <polygon points="60,51 57,54 63,54" fill="#00BFA5"/>
          {/* Mouth */}
          <path d="M 57 54 Q 60 58 63 54" stroke="#00BFA5" strokeWidth="1" fill="none"/>
          {/* Whiskers left */}
          <line x1="38" y1="50" x2="54" y2="52" stroke="#00BFA5" strokeWidth="0.8" strokeOpacity="0.7"/>
          <line x1="38" y1="54" x2="54" y2="54" stroke="#00BFA5" strokeWidth="0.8" strokeOpacity="0.7"/>
          {/* Whiskers right */}
          <line x1="82" y1="50" x2="66" y2="52" stroke="#00BFA5" strokeWidth="0.8" strokeOpacity="0.7"/>
          <line x1="82" y1="54" x2="66" y2="54" stroke="#00BFA5" strokeWidth="0.8" strokeOpacity="0.7"/>
          {/* Tail */}
          <path d="M 88 85 Q 100 70 95 58 Q 92 50 86 55" stroke="#00BFA5" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          {/* Paws */}
          <ellipse cx="45" cy="100" rx="8" ry="5" fill="#00BFA5" fillOpacity="0.2" stroke="#00BFA5" strokeWidth="1.2"/>
          <ellipse cx="75" cy="100" rx="8" ry="5" fill="#00BFA5" fillOpacity="0.2" stroke="#00BFA5" strokeWidth="1.2"/>
          {/* Paw toes left */}
          <ellipse cx="40" cy="97" rx="2.5" ry="2" fill="#00BFA5" fillOpacity="0.4"/>
          <ellipse cx="45" cy="96" rx="2.5" ry="2" fill="#00BFA5" fillOpacity="0.4"/>
          <ellipse cx="50" cy="97" rx="2.5" ry="2" fill="#00BFA5" fillOpacity="0.4"/>
          {/* Paw toes right */}
          <ellipse cx="70" cy="97" rx="2.5" ry="2" fill="#00BFA5" fillOpacity="0.4"/>
          <ellipse cx="75" cy="96" rx="2.5" ry="2" fill="#00BFA5" fillOpacity="0.4"/>
          <ellipse cx="80" cy="97" rx="2.5" ry="2" fill="#00BFA5" fillOpacity="0.4"/>
        </svg>
      </div>

      {/* Tagline */}
      <h1 className="text-5xl md:text-7xl font-bold mb-4 leading-tight">
        <span className="text-gradient">AI-Powered Clips.</span>
        <br />
        <span className="text-white">Zero Effort.</span>
      </h1>
      <p className="text-muted text-xl md:text-2xl max-w-2xl mb-2">
        Drop a video. Get viral-ready clips with AI-generated subtitles — formatted for TikTok, X, YouTube Shorts, and more.
      </p>
      <p className="text-primary text-sm font-medium tracking-widest uppercase mb-10">
        by Mars Cats Voyage
      </p>
    </section>
  )
}
