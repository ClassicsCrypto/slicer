import { getServerApiUrl } from '@/lib/api-url-server'

const SERVE_MARKER = '/serve/'

export function extractServedFileName(sourceUrl?: string | null): string | null {
  if (!sourceUrl) return null

  const markerIndex = sourceUrl.indexOf(SERVE_MARKER)
  if (markerIndex === -1) return null

  const rawFileName = sourceUrl.slice(markerIndex + SERVE_MARKER.length).split(/[?#]/)[0]
  if (!rawFileName) return null

  try {
    return decodeURIComponent(rawFileName)
  } catch {
    return rawFileName
  }
}

export async function normalizeSourceUrl(sourceUrl?: string | null): Promise<string | undefined> {
  if (!sourceUrl) return sourceUrl ?? undefined

  const fileName = extractServedFileName(sourceUrl)
  if (!fileName) return sourceUrl

  const apiBase = (await getServerApiUrl()).replace(/\/$/, '')
  return `${apiBase}${SERVE_MARKER}${encodeURIComponent(fileName)}`
}
