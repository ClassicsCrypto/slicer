import 'server-only'

import fs from 'fs'
import path from 'path'

const FALLBACK_URL = 'http://localhost:3001'

export async function getServerApiUrl(): Promise<string> {
  const internalUrl = process.env.SLICER_INTERNAL_API_URL || process.env.SLICER_API_INTERNAL_URL
  if (internalUrl) return internalUrl.replace(/\/$/, '')

  // Server-side routes run beside the local Slicer API. Prefer localhost so
  // still/thumbnail proxying does not round-trip through the public tunnel.
  if (process.env.SLICER_SERVER_API_USE_PUBLIC !== 'true') return FALLBACK_URL

  const envUrl = process.env.NEXT_PUBLIC_SLICER_API_URL
  if (envUrl) return envUrl.replace(/\/$/, '')

  // Public URL fallback for hosted deployments where the API is not colocated.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) {
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/public/slicer-videos/config/tunnel-url.txt`,
        { cache: 'no-store' },
      )
      if (res.ok) {
        const url = (await res.text()).trim()
        if (/^https?:\/\//i.test(url)) return url.replace(/\/$/, '')
      }
    }
  } catch {
    // Fall through
  }

  try {
    const tunnelFile = path.join(process.cwd(), 'server', 'tunnel-url.txt')
    if (fs.existsSync(tunnelFile)) {
      const url = fs.readFileSync(tunnelFile, 'utf8').trim()
      if (/^https?:\/\//i.test(url)) return url.replace(/\/$/, '')
    }
  } catch {
    // Fall through
  }

  return FALLBACK_URL
}
