/**
 * Cloudflare Quick Tunnel for Slicer API
 * Creates a *.trycloudflare.com URL that proxies to localhost:3001
 * Saves URL to tunnel-url.txt AND to Supabase Storage for frontend discovery
 * 
 * Uses an empty config to prevent cloudflared from loading the default config.yml
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const CLOUDFLARED = 'c:\\Program Files (x86)\\cloudflared\\cloudflared.exe'
const URL_FILE = path.join(__dirname, 'tunnel-url.txt')
const EMPTY_CONFIG = path.join(__dirname, 'tunnel-config-empty.yml')

// Create an empty config so cloudflared doesn't load the default one
fs.writeFileSync(EMPTY_CONFIG, '# empty config for quick tunnel\n', 'utf8')

// Load env
const envPath = path.join(__dirname, '..', '.env.local')
let SUPABASE_URL, SUPABASE_KEY
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key === 'NEXT_PUBLIC_SUPABASE_URL') SUPABASE_URL = val
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_KEY = val
  }
}

async function saveTunnelUrl(url) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[tunnel] No Supabase credentials, skipping URL save')
    return
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/slicer-videos/config/tunnel-url.txt`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'text/plain',
        'x-upsert': 'true',
      },
      body: url,
    })
    if (res.ok) {
      console.log(`[tunnel] Saved URL to Supabase Storage`)
    } else {
      const text = await res.text()
      console.log(`[tunnel] Failed to save to Supabase: ${res.status} ${text}`)
    }
  } catch (err) {
    console.log(`[tunnel] Error saving to Supabase: ${err.message}`)
  }
}

const proc = spawn(CLOUDFLARED, [
  '--config', EMPTY_CONFIG,
  'tunnel', '--url', 'http://localhost:3001', '--no-autoupdate'
], {
  stdio: ['ignore', 'pipe', 'pipe'],
})

let urlFound = false

function handleOutput(data) {
  const line = data.toString()
  process.stderr.write(line)

  const match = line.match(/(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/)
  if (match && !urlFound) {
    urlFound = true
    const url = match[1]
    fs.writeFileSync(URL_FILE, url, 'utf8')
    console.log(`\n🔗 Tunnel URL: ${url}`)
    console.log(`   Saved to: ${URL_FILE}\n`)
    saveTunnelUrl(url)
  }
}

proc.stdout.on('data', handleOutput)
proc.stderr.on('data', handleOutput)

proc.on('error', (err) => {
  console.error('Failed to start cloudflared:', err)
  process.exit(1)
})

proc.on('exit', (code) => {
  console.log('cloudflared exited with code', code)
  process.exit(code || 0)
})
