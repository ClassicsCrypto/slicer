import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = getAuthContext(request)
  if (!auth) return NextResponse.json({ authenticated: false }, { status: 401 })
  return NextResponse.json({ authenticated: true, user: auth.user, workspace: auth.workspace, isDevBypass: auth.isDevBypass })
}
