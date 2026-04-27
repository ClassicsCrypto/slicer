import 'server-only'

import { createPublicClient, fallback, getAddress, http } from 'viem'
import { mainnet } from 'viem/chains'

const ENS_TIMEOUT_MS = 5_000

function rpcTransports() {
  return [
    process.env.ETHEREUM_RPC_URL,
    process.env.MAINNET_RPC_URL,
    process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL,
    'https://ethereum.publicnode.com',
    'https://rpc.ankr.com/eth',
  ]
    .filter((url): url is string => Boolean(url))
    .map((url) => http(url, { timeout: ENS_TIMEOUT_MS }))
}

const client = createPublicClient({
  chain: mainnet,
  transport: fallback(rpcTransports(), { rank: false }),
})

export async function resolveEnsNameForAddress(address?: string | null): Promise<string | null> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null

  try {
    const checksumAddress = getAddress(address)
    const name = await client.getEnsName({ address: checksumAddress })
    if (!name) return null

    // Forward-confirm so stale/reassigned reverse records do not spoof display names.
    const resolvedAddress = await client.getEnsAddress({ name })
    if (!resolvedAddress || getAddress(resolvedAddress) !== checksumAddress) return null

    return name
  } catch {
    return null
  }
}

export function shortWalletAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}
