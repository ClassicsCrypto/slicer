'use client'

import React from 'react'

const features = [
  { icon: '🎬', label: 'Auto Clip Detection' },
  { icon: '📝', label: 'AI Subtitles' },
  { icon: '📱', label: 'Platform-Ready Formats' },
  { icon: '🎨', label: 'Custom Subtitle Styles' },
  { icon: '⚡', label: 'Fast Processing' },
  { icon: '🔒', label: 'Secure Storage' },
  { icon: '🎯', label: 'Highlight Detection' },
  { icon: '🚀', label: 'One-Click Export' },
  { icon: '🌊', label: 'Batch Processing' },
  { icon: '✂️', label: 'Smart Trimming' },
]

// Double the array for seamless loop
const doubled = [...features, ...features]

export default function FeatureMarquee() {
  return (
    <div className="w-full overflow-hidden py-8 border-y border-white/5 bg-surface/50">
      <div className="flex animate-marquee whitespace-nowrap">
        {doubled.map((feature, i) => (
          <div
            key={i}
            className="inline-flex items-center gap-3 mx-6 px-5 py-3 rounded-full border border-primary/20 bg-primary/5 text-white flex-shrink-0"
          >
            <span className="text-2xl">{feature.icon}</span>
            <span className="text-sm font-semibold tracking-wide">{feature.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
