import { NextRequest, NextResponse } from 'next/server'
import { getInternalServerApiUrl } from '@/lib/api-url-server'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const sourceUrl = request.nextUrl.searchParams.get('sourceUrl')
  const timestamp = request.nextUrl.searchParams.get('timestamp')

  if (!sourceUrl) return NextResponse.json({ error: 'sourceUrl required' }, { status: 400 })
  if (!timestamp) return NextResponse.json({ error: 'timestamp required' }, { status: 400 })

  const apiBase = getInternalServerApiUrl()
  const stillUrl = new URL(`${apiBase}/still`)

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    stillUrl.searchParams.set(key, value)
  }

  const stillResponse = await fetch(stillUrl, { cache: 'no-store' })
  if (!stillResponse.ok || !stillResponse.body) {
    const payload = await stillResponse.json().catch(() => ({}))
    return NextResponse.json({ error: payload.error || `Still export failed with ${stillResponse.status}` }, { status: 502 })
  }

  const headers = new Headers()
  for (const name of [
    'content-type',
    'content-length',
    'content-disposition',
    'x-slicer-requested-timestamp',
    'x-slicer-selected-timestamp',
    'x-slicer-still-score',
    'x-slicer-still-reason',
  ]) {
    const value = stillResponse.headers.get(name)
    if (value) headers.set(name, value)
  }

  // Always private: this response is auth-gated, and the backend's own
  // /still header says public — passing that through would let a shared
  // cache serve one user's still to another.
  headers.set('cache-control', 'private, max-age=86400, stale-while-revalidate=604800')

  return new NextResponse(stillResponse.body, { status: 200, headers })
}
