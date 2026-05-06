'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>
    }
  }
}

type AuthPayload = {
  authenticated: boolean
  user: {
    displayName: string
    email: string | null
    avatarUrl: string | null
    primaryProvider: string
    walletAddress?: string | null
    ensName?: string | null
    linkedProviders?: string[]
  }
  workspace: {
    name: string
    role: string
  }
  isDevBypass: boolean
}

export default function AccountMenu() {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [auth, setAuth] = useState<AuthPayload | null>(null)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeRequested, setCodeRequested] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailStatus, setEmailStatus] = useState('')
  const [devCode, setDevCode] = useState('')
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletStatus, setWalletStatus] = useState('')
  const walletAvailable = useMemo(() => typeof window !== 'undefined' && Boolean(window.ethereum), [])

  const refreshAuth = () => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setAuth(payload))
      .catch(() => setAuth(null))
  }

  useEffect(() => {
    let mounted = true
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (mounted) setAuth(payload) })
      .catch(() => { if (mounted) setAuth(null) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  const requestEmailCode = async (event: FormEvent) => {
    event.preventDefault()
    setEmailBusy(true)
    setEmailStatus('')
    setDevCode('')
    try {
      const response = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Could not create email code')
      setCodeRequested(true)
      setEmailStatus('Code ready. Verify it to link this email.')
      if (payload?.devCode) {
        setDevCode(payload.devCode)
        setCode(payload.devCode)
      }
    } catch (error: any) {
      setEmailStatus(error?.message || 'Email link failed')
    } finally {
      setEmailBusy(false)
    }
  }

  const verifyEmailCode = async (event: FormEvent) => {
    event.preventDefault()
    setEmailBusy(true)
    setEmailStatus('')
    try {
      const response = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Code verification failed')
      setEmailStatus('Email linked. You can sign in with it now.')
      setCodeRequested(false)
      setCode('')
      setDevCode('')
      refreshAuth()
    } catch (error: any) {
      setEmailStatus(error?.message || 'Code verification failed')
    } finally {
      setEmailBusy(false)
    }
  }

  const connectWallet = async () => {
    setWalletBusy(true)
    setWalletStatus('')
    try {
      if (!window.ethereum) {
        setWalletStatus('No wallet found. Install MetaMask/Rabby or use email sign-in.')
        return
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      const walletAddress = accounts?.[0]
      if (!walletAddress) throw new Error('No wallet selected')

      const nonceResponse = await fetch('/api/auth/wallet/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
      const noncePayload = await nonceResponse.json()
      if (!nonceResponse.ok) throw new Error(noncePayload?.error || 'Failed to create wallet nonce')

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [noncePayload.message, walletAddress],
      }) as `0x${string}`

      const verifyResponse = await fetch('/api/auth/wallet/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature }),
      })
      const verifyPayload = await verifyResponse.json()
      if (!verifyResponse.ok) throw new Error(verifyPayload?.error || 'Wallet verification failed')
      setWalletStatus('Wallet linked. You can sign in with it now.')
      refreshAuth()
    } catch (error: any) {
      setWalletStatus(error?.message || 'Wallet link failed')
    } finally {
      setWalletBusy(false)
    }
  }

  if (!auth?.authenticated) {
    return <div className="text-white/20 text-xs">Not signed in</div>
  }

  const linkedProviders = auth.user.linkedProviders || []
  const hasEmail = Boolean(auth.user.email || linkedProviders.includes('email'))
  const hasWallet = Boolean(auth.user.walletAddress || linkedProviders.includes('wallet'))

  return (
    <div ref={menuRef} className="relative flex items-center gap-3 text-right">
      <button type="button" onClick={() => setOpen((value) => !value)} className="group text-right">
        <div className="text-xs font-semibold text-white group-hover:text-white/80">{auth.user.ensName || auth.user.displayName}</div>
        <div className="text-[11px] text-white/35">
          {hasEmail ? 'Email linked' : 'No email'} · {hasWallet ? 'Wallet linked' : 'No wallet'}{auth.isDevBypass ? ' · dev mode' : ''}
        </div>
      </button>
      <button
        type="button"
        onClick={logout}
        className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/50 transition hover:border-white/20 hover:text-white"
      >
        Sign out
      </button>

      {open && (
        <div className="liquid-card top-origin-popover fixed right-4 top-20 z-50 max-h-[calc(100vh-6rem)] w-80 overflow-y-auto p-4 text-left shadow-2xl shadow-black/40 sm:right-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-white">Account links</div>
              <div className="mt-1 text-xs text-white/45">Link email and wallet once, then sign in with either later.</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-white/10 px-2 py-1 text-xs font-bold text-white/45 transition hover:border-white/25 hover:text-white"
              aria-label="Close account options"
            >
              ×
            </button>
          </div>

          <div className="space-y-3 text-xs text-white/55">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="font-semibold text-white">Email</div>
              <div className="mt-1">{auth.user.email || 'No email linked yet.'}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="font-semibold text-white">Wallet</div>
              <div className="mt-1 break-all">{auth.user.ensName || auth.user.walletAddress || 'No wallet linked yet.'}</div>
            </div>
          </div>

          <form onSubmit={codeRequested ? verifyEmailCode : requestEmailCode} className="mt-4 space-y-2">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="link@email.com"
              className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
              required
            />
            {codeRequested && (
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-semibold tracking-[0.3em] text-white outline-none transition placeholder:tracking-normal placeholder:text-white/25 focus:border-white/30"
                required
              />
            )}
            <button type="submit" disabled={emailBusy} className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white transition hover:border-white/25 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
              {emailBusy ? 'Working…' : codeRequested ? 'Verify + link email' : hasEmail ? 'Change linked email' : 'Link email'}
            </button>
            {devCode && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">Preview code: <span className="font-mono font-bold tracking-[0.25em]">{devCode}</span></div>}
            {emailStatus && <p className="text-xs text-white/45">{emailStatus}</p>}
          </form>

          <button type="button" onClick={connectWallet} disabled={walletBusy} className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white transition hover:border-white/25 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60">
            {walletBusy ? 'Waiting for wallet…' : hasWallet ? 'Change linked wallet' : 'Link wallet'}
          </button>
          {!walletAvailable && <p className="mt-2 text-xs text-white/30">Wallet linking appears when a browser wallet is installed.</p>}
          {walletStatus && <p className="mt-2 text-xs text-white/45">{walletStatus}</p>}
        </div>
      )}
    </div>
  )
}
