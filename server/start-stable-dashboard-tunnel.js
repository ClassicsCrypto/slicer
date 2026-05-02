/**
 * Stable Cloudflare named tunnel for the Slicer dashboard.
 *
 * Existing Cloudflare route:
 *   https://mc.marscatsvoyage.com -> http://localhost:3000
 *
 * This avoids sharing rotating *.trycloudflare.com quick-tunnel URLs.
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const CLOUDFLARED = 'c:\\Program Files (x86)\\cloudflared\\cloudflared.exe'
const CONFIG = path.join(os.homedir(), '.cloudflared', 'config.yml')
const STABLE_URL_FILE = path.join(__dirname, 'stable-dashboard-url.txt')
const STABLE_URL = 'https://mc.marscatsvoyage.com'

if (!fs.existsSync(CLOUDFLARED)) {
  console.error(`[stable-dashboard-tunnel] cloudflared not found: ${CLOUDFLARED}`)
  process.exit(1)
}

if (!fs.existsSync(CONFIG)) {
  console.error(`[stable-dashboard-tunnel] config not found: ${CONFIG}`)
  process.exit(1)
}

fs.writeFileSync(STABLE_URL_FILE, STABLE_URL, 'utf8')
console.log(`[stable-dashboard-tunnel] Starting stable dashboard tunnel: ${STABLE_URL}`)
console.log(`[stable-dashboard-tunnel] Config: ${CONFIG}`)

const proc = spawn(CLOUDFLARED, [
  '--config', CONFIG,
  'tunnel', '--no-autoupdate', 'run', 'mcv-mission-control',
], {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

proc.stdout.on('data', (data) => process.stdout.write(data))
proc.stderr.on('data', (data) => process.stderr.write(data))

proc.on('error', (err) => {
  console.error('[stable-dashboard-tunnel] Failed to start cloudflared:', err)
  process.exit(1)
})

proc.on('exit', (code) => {
  console.log(`[stable-dashboard-tunnel] cloudflared exited with code ${code}`)
  process.exit(code || 0)
})
