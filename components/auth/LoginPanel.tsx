'use client'

import { useMemo, useState } from 'react'

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>
    }
  }
}

const providerButtons = [
  { provider: 'google', label: 'Continue with Google', icon: 'G' },
  { provider: 'discord', label: 'Continue with Discord', icon: '☯' },
]

export default function LoginPanel() {
  const [walletStatus, setWalletStatus] = useState<string>('')
  const [walletBusy, setWalletBusy] = useState(false)
  const walletAvailable = useMemo(() => typeof window !== 'undefined' && Boolean(window.ethereum), [])

  const connectWallet = async () => {
    setWalletBusy(true)
    setWalletStatus('')
    try {
      if (!window.ethereum) {
        setWalletStatus('No wallet found. Install MetaMask/Rabby or use Google/Discord.')
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
      window.location.href = verifyPayload.redirectTo || '/dashboard'
    } catch (error: any) {
      setWalletStatus(error?.message || 'Wallet sign-in failed')
    } finally {
      setWalletBusy(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 p-5 text-left" style={{ background: '#15151F' }}>
      <div className="mb-4">
        <div className="text-sm font-bold text-white">Sign in to Slicer</div>
        <div className="text-xs text-white/40 mt-1">Use Google, Discord, or a wallet. They all map to the same workspace model.</div>
      </div>

      <div className="space-y-3">
        {providerButtons.map((button) => (
          <a
            key={button.provider}
            href={`/api/auth/start/${button.provider}`}
            className="flex items-center justify-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-white/25 hover:bg-white/5"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-black">{button.icon}</span>
            {button.label}
          </a>
        ))}

        <button
          type="button"
          onClick={connectWallet}
          disabled={walletBusy}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-white/25 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">◇</span>
          {walletBusy ? 'Waiting for wallet…' : 'Connect Wallet'}
        </button>
      </div>

      {!walletAvailable && (
        <p className="mt-3 text-xs text-white/30">Wallet sign-in appears when a browser wallet is installed.</p>
      )}
      {walletStatus && <p className="mt-3 text-xs text-red-300">{walletStatus}</p>}
    </div>
  )
}
