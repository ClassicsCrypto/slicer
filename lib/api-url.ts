/**
 * Discover the Slicer API URL.
 * 
 * Priority:
 * 1. NEXT_PUBLIC_SLICER_API_URL env var (set in Vercel or .env.local)
 * 2. Supabase Storage config file (auto-updated by tunnel on start)
 * 3. Fallback to localhost:3001 (local dev)
 */

let cachedUrl: string | null = null
let cacheTime = 0
const CACHE_TTL = 60_000 // 1 minute

export async function getApiUrl(): Promise<string> {
  // Env var takes priority
  const envUrl = process.env.NEXT_PUBLIC_SLICER_API_URL
  if (envUrl) return envUrl

  // Check cache
  if (cachedUrl && Date.now() - cacheTime < CACHE_TTL) return cachedUrl

  // Try Supabase Storage
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) {
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/public/slicer-videos/config/tunnel-url.txt`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const url = (await res.text()).trim()
        if (url.startsWith('https://')) {
          cachedUrl = url
          cacheTime = Date.now()
          return url
        }
      }
    }
  } catch {
    // Fall through to default
  }

  return 'http://localhost:3001'
}
