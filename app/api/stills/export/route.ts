import { NextRequest, NextResponse } from 'next/server'
import { getInternalServerApiUrl } from '@/lib/api-url-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
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

  const upstreamCache = stillResponse.headers.get('cache-control')
  headers.set('cache-control', upstreamCache || 'public, max-age=86400, stale-while-revalidate=604800')

  return new NextResponse(stillResponse.body, { status: 200, headers })
}
