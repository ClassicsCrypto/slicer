'use client'

import { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'text-white hover:scale-105 glow-red',
    secondary: 'border border-white/10 text-white hover:border-white/30 hover:bg-white/5',
    danger: 'text-white hover:opacity-80',
    ghost: 'text-white/60 hover:text-white hover:bg-white/5',
    success: 'text-white hover:scale-105',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-8 py-3.5 text-base',
  }

  const variantStyle: Record<string, React.CSSProperties> = {
    primary: { background: 'linear-gradient(135deg, #FF5A36, #FF7A5C)' },
    secondary: { background: '#16121D' },
    danger: { background: 'linear-gradient(135deg, #FF5A36, #DC2626)' },
    ghost: {},
    success: { background: 'linear-gradient(135deg, #16A34A, #22C55E)' },
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      style={variantStyle[variant]}
      {...props}
    >
      {children}
    </button>
  )
}
