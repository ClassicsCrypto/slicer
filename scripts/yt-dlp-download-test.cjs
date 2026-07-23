const assert = require('node:assert/strict')
const {
  formatDownloadError,
  getDownloadExecOptions,
  getDownloadFileId,
} = require('../server/lib/yt-dlp-download.js')

const url = 'https://x.com/i/broadcasts/1qJDzzeNpDLKV'
assert.equal(getDownloadFileId(url), getDownloadFileId(url), 'retry must reuse the same output prefix')
assert.notEqual(getDownloadFileId(url), getDownloadFileId(`${url}?different=1`), 'different sources must not collide')

const options = getDownloadExecOptions()
assert.equal(options.timeout, 0, 'healthy long downloads must not have a wall-clock timeout')
assert.equal(options.maxBuffer, 50 * 1024 * 1024)

assert.equal(
  formatDownloadError(new Error('command with private implementation details'), '', true),
  'Download stalled because no media progress was detected. Retry to resume it.',
)
assert.equal(
  formatDownloadError({ signal: 'SIGTERM' }, '', false),
  'Download stopped unexpectedly (SIGTERM). Retry to resume it.',
)
assert.equal(
  formatDownloadError(new Error('raw command'), 'network unavailable', false),
  'Download failed: network unavailable',
)

console.log('yt-dlp download regression checks passed')
