const crypto = require('crypto')

function getDownloadFileId(url) {
  return `download-${crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 16)}`
}

function getDownloadExecOptions() {
  return {
    // A download may legitimately take hours. The progress-aware watchdog in
    // downloadAudio owns termination; a wall-clock timeout kills healthy jobs.
    timeout: 0,
    maxBuffer: 50 * 1024 * 1024,
  }
}

function formatDownloadError(error, stderr, stalled) {
  if (stalled) return 'Download stalled because no media progress was detected. Retry to resume it.'

  const detail = String(stderr || '').trim()
  if (detail) return `Download failed: ${detail.slice(-500)}`

  if (error?.signal) return `Download stopped unexpectedly (${error.signal}). Retry to resume it.`
  return 'Download failed unexpectedly. Retry to resume it.'
}

module.exports = {
  formatDownloadError,
  getDownloadExecOptions,
  getDownloadFileId,
}
