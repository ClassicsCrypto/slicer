import { NextResponse } from 'next/server'
import { getServerApiUrl } from '@/lib/api-url-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiUrl = await getServerApiUrl()
  return NextResponse.json(
    { apiUrl },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
