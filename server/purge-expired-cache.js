const { runRetentionSweep } = require('./lib/retention-sweeper.js')

async function main() {
  const apply = process.argv.includes('--apply')
  const result = await runRetentionSweep({
    apply,
    reason: apply ? 'manual_apply' : 'manual_dry_run',
    source: 'purge-expired-cache',
  })

  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
