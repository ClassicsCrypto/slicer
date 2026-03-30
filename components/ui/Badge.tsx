'use client'

import { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'red' | 'teal' | 'dark' | 'green'
}

export default function Badge({ children, variant = 'dark' }: BadgeProps) {
  const variants = {
    red: 'bg-red-500/20 text-red-400 border-red-500/30',
    teal: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    dark: 'bg-white/5 text-white/60 border-white/10',
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${variants[variant]}`}>
      {children}
    </span>
  )
}
