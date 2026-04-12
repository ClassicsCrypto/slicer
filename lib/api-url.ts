/**
 * Discover the Slicer API URL.
 *
 * Priority:
 * 1. NEXT_PUBLIC_SLICER_API_URL env var (set in Vercel or .env.local)
 * 2. Same-origin runtime config route (reads local tunnel-url.txt)
 * 3. Supabase Storage config file (legacy fallback)
 * 4. Fallback to localhost:3001 (local dev)
 */

let cachedUrl: string | null = null
let cacheTime = 0
const CACHE_TTL = 60_000 // 1 minute
const FALLBACK_URL = 'http://localhost:3001'

function cacheUrl(url: string) {
  cachedUrl = url.replace(/\/$/, '')
  cacheTime = Date.now()
  return cachedUrl
}

export async function getApiUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_SLICER_API_URL
  if (envUrl) return envUrl.replace(/\/$/, '')

  if (cachedUrl && Date.now() - cacheTime < CACHE_TTL) return cachedUrl

  try {
    const runtimeConfigRes = await fetch('/api/runtime-config', { cache: 'no-store' })
    if (runtimeConfigRes.ok) {
      const data = await runtimeConfigRes.json()
      if (typeof data?.apiUrl === 'string' && /^https?:\/\//i.test(data.apiUrl)) {
        return cacheUrl(data.apiUrl)
      }
    }
  } catch {
    // Fall through to legacy lookup
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) {
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/public/slicer-videos/config/tunnel-url.txt`,
        { cache: 'no-store' },
      )
      if (res.ok) {
        const url = (await res.text()).trim()
        if (/^https?:\/\//i.test(url)) {
          return cacheUrl(url)
        }
      }
    }
  } catch {
    // Fall through to default
  }

  return cacheUrl(FALLBACK_URL)
}
