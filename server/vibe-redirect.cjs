const http = require('http')

const PORT = Number(process.env.PORT || 3002)
const TARGET_URL = 'https://www.otherside.xyz/worlds?world=yummy-hats-sneeze-589242&project=beige-spiders-raise-768965'

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('ok\n')
    return
  }

  res.writeHead(302, {
    location: TARGET_URL,
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  })
  res.end(`Redirecting to ${TARGET_URL}\n`)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[vibe-redirect] listening on http://0.0.0.0:${PORT}`)
  console.log(`[vibe-redirect] redirect target: ${TARGET_URL}`)
})
