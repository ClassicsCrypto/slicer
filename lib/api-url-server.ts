import 'server-only'

import fs from 'fs'
import path from 'path'

const FALLBACK_URL = 'http://localhost:3001'

function cleanUrl(url: string) {
  return url.replace(/\/$/, '')
}

/**
 * Headers Next server routes must attach when calling the compute backend
 * (server/youtube-api.js). Intentionally does NOT reuse getInternalRequestHeaders():
 * that helper prefers AUTOCLIP_POLL_SECRET, which guards Next's own internal
 * routes and may legitimately differ from the backend's SLICER_INTERNAL_TOKEN.
 * Also attaches Cloudflare Access service-token headers when configured, so the
 * tunnel hostname can be put behind Cloudflare Access without code changes.
 */
export function backendAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = (process.env.SLICER_INTERNAL_TOKEN || '').trim()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const cfId = process.env.CF_ACCESS_CLIENT_ID
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET
  if (cfId && cfSecret) {
    headers['CF-Access-Client-Id'] = cfId
    headers['CF-Access-Client-Secret'] = cfSecret
  }
  return headers
}

export function getInternalServerApiUrl(): string {
  const internalUrl = process.env.SLICER_INTERNAL_API_URL || process.env.SLICER_API_INTERNAL_URL
  if (internalUrl) return cleanUrl(internalUrl)
  return FALLBACK_URL
}

export async function getServerApiUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SLICER_API_URL
  if (envUrl) return cleanUrl(envUrl)

  // Browser-facing runtime config must return a public URL. Returning localhost
  // works on this machine but breaks clip thumbnails for everyone else.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) {
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/public/slicer-videos/config/tunnel-url.txt`,
        { cache: 'no-store' },
      )
      if (res.ok) {
        const url = (await res.text()).trim()
        if (/^https?:\/\//i.test(url)) return cleanUrl(url)
      }
    }
  } catch {
    // Fall through
  }

  try {
    const tunnelFile = path.join(process.cwd(), 'server', 'tunnel-url.txt')
    if (fs.existsSync(tunnelFile)) {
      const url = fs.readFileSync(tunnelFile, 'utf8').trim()
      if (/^https?:\/\//i.test(url)) return cleanUrl(url)
    }
  } catch {
    // Fall through
  }

  return FALLBACK_URL
}
