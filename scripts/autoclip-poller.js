const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = value
  }
}

const baseUrl = process.env.SLICER_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000'
const mode = process.env.AUTOCLIP_POLL_MODE || 'vod'
const secret = process.env.AUTOCLIP_POLL_SECRET || process.env.SLICER_INTERNAL_TOKEN || process.env.CRON_SECRET || ''

async function poll() {
  const startedAt = new Date().toISOString()
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/autoclip/poll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { Authorization: `Bearer ${secret}` } : { 'x-slicer-local-poller': '1' }),
      },
      body: JSON.stringify({ mode, dryRun: false }),
    })
    const text = await res.text()
    console.log(`[autoclip-poller] ${startedAt} status=${res.status} ${text}`)
    if (!res.ok) process.exitCode = 1
  } catch (error) {
    console.error(`[autoclip-poller] ${startedAt} failed:`, error.message)
    process.exitCode = 1
  }
}

poll()
