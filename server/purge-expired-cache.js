const { runRetentionSweep } = require('./lib/retention-sweeper.js')

async function main() {
  const requestedApply = process.argv.includes('--apply')
  if (requestedApply) {
    console.warn('[purge-expired-cache] Phase 4 is dry-run only. Ignoring --apply and generating a retention report without deleting anything.')
  }

  const result = await runRetentionSweep({
    apply: false,
    reason: requestedApply ? 'manual_dry_run_apply_requested' : 'manual_dry_run',
    source: 'purge-expired-cache',
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
