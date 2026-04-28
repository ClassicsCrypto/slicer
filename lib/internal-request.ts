import { NextRequest } from 'next/server'

const LOCAL_POLLER_HEADER = 'x-slicer-local-poller'

function configuredSecret() {
  return process.env.AUTOCLIP_POLL_SECRET || process.env.SLICER_INTERNAL_TOKEN || process.env.CRON_SECRET || ''
}

export function getInternalRequestHeaders(): Record<string, string> {
  const secret = configuredSecret()
  return secret
    ? { Authorization: `Bearer ${secret}` }
    : { [LOCAL_POLLER_HEADER]: '1' }
}

export function isTrustedInternalRequest(request: NextRequest) {
  const secret = configuredSecret()
  const authorization = request.headers.get('authorization') || ''
  if (secret && authorization === `Bearer ${secret}`) return true

  const host = request.nextUrl.hostname.toLowerCase()
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  return isLocalHost && request.headers.get(LOCAL_POLLER_HEADER) === '1'
}
