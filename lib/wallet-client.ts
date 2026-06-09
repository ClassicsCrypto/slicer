'use client'

type EthereumRequest = {
  method: string
  params?: unknown[]
}

export type EthereumProvider = {
  isMetaMask?: boolean
  providers?: EthereumProvider[]
  request: (args: EthereumRequest) => Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

const WALLET_REQUEST_TIMEOUT_MS = 45_000

export function getWalletProvider() {
  const ethereum = window.ethereum
  if (!ethereum) return null
  return ethereum.providers?.find((provider) => provider.isMetaMask) || ethereum
}

export async function getWalletAddress(provider: EthereumProvider) {
  const existingAccounts = await requestWallet<string[]>(provider, { method: 'eth_accounts' }, 5000).catch(() => [])
  if (existingAccounts?.[0]) return existingAccounts[0]

  const requestedAccounts = await requestWallet<string[]>(provider, { method: 'eth_requestAccounts' })
  if (!requestedAccounts?.[0]) throw new Error('No wallet selected')
  return requestedAccounts[0]
}

export async function signWalletMessage(provider: EthereumProvider, message: string, walletAddress: string) {
  return requestWallet<`0x${string}`>(provider, {
    method: 'personal_sign',
    params: [message, walletAddress],
  })
}

async function requestWallet<T>(provider: EthereumProvider, request: EthereumRequest, timeoutMs = WALLET_REQUEST_TIMEOUT_MS) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      provider.request(request) as Promise<T>,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Wallet request timed out. Close MetaMask popups and try again.')), timeoutMs)
      }),
    ])
  } catch (error) {
    throw new Error(formatWalletError(error))
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function formatWalletError(error: unknown) {
  const walletError = error as { code?: number | string; message?: string }
  if (walletError?.code === 4001) return 'Wallet request was rejected.'
  if (walletError?.code === -32002) return 'MetaMask already has a pending request. Open MetaMask and finish or cancel it, then try again.'

  const message = walletError?.message || ''
  if (/already pending|request already/i.test(message)) {
    return 'MetaMask already has a pending request. Open MetaMask and finish or cancel it, then try again.'
  }
  if (/unexpected error/i.test(message)) {
    return 'MetaMask hit an internal request error. Close the MetaMask popup, unlock it if needed, and try again.'
  }
  return message || 'Wallet sign-in failed'
}
