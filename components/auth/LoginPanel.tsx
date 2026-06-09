'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getWalletAddress, getWalletProvider, signWalletMessage } from '@/lib/wallet-client'

export default function LoginPanel() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailStatus, setEmailStatus] = useState<string>('')
  const [devCode, setDevCode] = useState<string>('')
  const [codeRequested, setCodeRequested] = useState(false)
  const [walletStatus, setWalletStatus] = useState<string>('')
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletAvailable, setWalletAvailable] = useState(false)

  useEffect(() => {
    setWalletAvailable(Boolean(getWalletProvider()))
  }, [])

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
      if (!response.ok) throw new Error(payload?.error || 'Could not create login code')
      setCodeRequested(true)
      setEmailStatus('One-time code ready. Enter it below.')
      if (payload?.devCode) {
        setDevCode(payload.devCode)
        setCode(payload.devCode)
      }
    } catch (error: any) {
      setEmailStatus(error?.message || 'Email login failed')
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
      window.location.href = payload.redirectTo || '/dashboard'
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
      const provider = getWalletProvider()
      if (!provider) {
        setWalletStatus('No wallet found. Install MetaMask/Rabby or use email sign-in.')
        return
      }
      const walletAddress = await getWalletAddress(provider)

      const nonceResponse = await fetch('/api/auth/wallet/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })
      const noncePayload = await nonceResponse.json()
      if (!nonceResponse.ok) throw new Error(noncePayload?.error || 'Failed to create wallet nonce')

      const signature = await signWalletMessage(provider, noncePayload.message, walletAddress)

      const verifyResponse = await fetch('/api/auth/wallet/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature }),
      })
      const verifyPayload = await verifyResponse.json()
      if (!verifyResponse.ok) throw new Error(verifyPayload?.error || 'Wallet verification failed')
      window.location.href = verifyPayload.redirectTo || '/dashboard'
    } catch (error: any) {
      setWalletStatus(error?.message || 'Wallet sign-in failed')
    } finally {
      setWalletBusy(false)
    }
  }

  return (
    <div className="liquid-card w-full max-w-sm p-5 text-left">
      <div className="mb-4">
        <div className="text-sm font-bold text-white">Sign in to Slicer</div>
        <div className="text-xs text-white/40 mt-1">Use an email one-time code or a wallet. Discord login is disabled while Slicer gets its own app identity.</div>
      </div>

      <div className="space-y-3">
        <form onSubmit={codeRequested ? verifyEmailCode : requestEmailCode} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@example.com"
            className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/25 focus:border-white/30"
            required
          />
          {codeRequested && (
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold tracking-[0.35em] text-white outline-none transition placeholder:tracking-normal placeholder:text-white/25 focus:border-white/30"
              required
            />
          )}
          <button
            type="submit"
            disabled={emailBusy}
            className="liquid-button flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-white/25 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-black">@</span>
            {emailBusy ? 'Working…' : codeRequested ? 'Verify code' : 'Send one-time code'}
          </button>
        </form>

        {devCode && (
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100">
            Preview code: <span className="font-mono font-bold tracking-[0.25em]">{devCode}</span>
          </div>
        )}
        {emailStatus && <p className="text-xs text-white/45">{emailStatus}</p>}

        <div className="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/25">
          <div className="h-px flex-1 bg-white/10" />
          or
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={connectWallet}
          disabled={walletBusy}
          className="liquid-button flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-white/25 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">◇</span>
          {walletBusy ? 'Waiting for wallet…' : 'Connect Wallet'}
        </button>
      </div>

      {!walletAvailable && (
        <p className="mt-3 text-xs text-white/30">Wallet sign-in appears when a browser wallet is installed.</p>
      )}
      {walletStatus && <p className="mt-3 text-xs text-red-300">{walletStatus}</p>}
      <p className="mt-3 text-[11px] text-white/25">Google sign-in is pending an MCV-owned Google OAuth app.</p>
    </div>
  )
}
