export function getPublicBaseUrl(requestUrl?: string | URL) {
  const configured = process.env.SLICER_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/+$/, '')

  if (requestUrl) {
    const url = typeof requestUrl === 'string' ? new URL(requestUrl) : requestUrl
    return url.origin.replace(/\/+$/, '')
  }

  return 'http://localhost:3000'
}
