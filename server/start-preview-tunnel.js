/**
 * Cloudflare Quick Tunnel for the Slicer preview UI
 * Creates a *.trycloudflare.com URL that proxies to localhost:3000
 * Saves the URL to preview-url.txt for easy sharing
 *
 * Uses an empty config so cloudflared does not load a default config.yml
 */
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const CLOUDFLARED = 'c:\\Program Files (x86)\\cloudflared\\cloudflared.exe'
const URL_FILE = path.join(__dirname, 'preview-url.txt')
const EMPTY_CONFIG = path.join(__dirname, 'preview-tunnel-empty.yml')

fs.writeFileSync(EMPTY_CONFIG, '# empty config for preview tunnel\n', 'utf8')

const proc = spawn(CLOUDFLARED, [
  '--config', EMPTY_CONFIG,
  'tunnel', '--url', 'http://localhost:3000', '--no-autoupdate',
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
    console.log(`\n🔗 Preview URL: ${url}`)
    console.log(`   Saved to: ${URL_FILE}\n`)
  }
}

proc.stdout.on('data', handleOutput)
proc.stderr.on('data', handleOutput)

proc.on('error', (err) => {
  console.error('Failed to start preview cloudflared:', err)
  process.exit(1)
})

proc.on('exit', (code) => {
  console.log('preview cloudflared exited with code', code)
  process.exit(code || 0)
})
