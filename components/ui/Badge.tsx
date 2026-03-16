import React from 'react'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-500/15 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  info: 'bg-primary/15 text-primary border-primary/30',
  default: 'bg-white/10 text-muted border-white/20',
}

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  )
}
