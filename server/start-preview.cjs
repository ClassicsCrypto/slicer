#!/usr/bin/env node
// Stable PM2 entrypoint for the Slicer dashboard preview.
// PM2 on Windows was dropping CLI args for `next start`, leaving the app in
// dev mode and causing intermittent _next/static CSS/JS 404s after builds.
process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.argv = [process.argv[0], 'next', 'start', '-p', process.env.PORT || '3000']
require('../node_modules/next/dist/bin/next')
