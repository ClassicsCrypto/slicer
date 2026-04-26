'use client'

import { useEffect, useState } from 'react'

type AuthPayload = {
  authenticated: boolean
  user: {
    displayName: string
    email: string | null
    avatarUrl: string | null
    primaryProvider: string
  }
  workspace: {
    name: string
    role: string
  }
  isDevBypass: boolean
}

export default function AccountMenu() {
  const [auth, setAuth] = useState<AuthPayload | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (mounted) setAuth(payload) })
      .catch(() => { if (mounted) setAuth(null) })
    return () => { mounted = false }
  }, [])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  if (!auth?.authenticated) {
    return <div className="text-white/20 text-xs">Not signed in</div>
  }

  return (
    <div className="flex items-center gap-3 text-right">
      <div>
        <div className="text-xs font-semibold text-white">{auth.user.displayName}</div>
        <div className="text-[11px] text-white/35">
          {auth.workspace.name} · {auth.workspace.role}{auth.isDevBypass ? ' · dev mode' : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={logout}
        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/50 transition hover:border-white/20 hover:text-white"
      >
        Sign out
      </button>
    </div>
  )
}
