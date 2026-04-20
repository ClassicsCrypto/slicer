/**
 * Smoke test for the retention sweeper.
 *
 * Default: verifies Phase 4 dry-run behavior.
 * With --apply: verifies Phase 5 real deletion behavior.
 *
 * Run with:
 *   SLICER_JOB_STORE=sqlite node server/lib/retention-sweeper.smoke.js
 *   SLICER_JOB_STORE=sqlite node server/lib/retention-sweeper.smoke.js --apply
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

process.env.SLICER_JOB_STORE = 'sqlite'

const SERVER_DIR = path.join(__dirname, '..')
const SHADOW_STORE_PATH = path.join(SERVER_DIR, 'lib', 'sqlite-shadow-store.js')
const SWEEPER_SOURCE_PATH = path.join(SERVER_DIR, 'lib', 'retention-sweeper.js')

function assert(condition, message) {
  if (!condition) throw new Error(`[retention-smoke] ${message}`)
}

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'slicer-retention-smoke-'))
  const sandboxServerDir = path.join(root, 'server')
  fs.mkdirSync(sandboxServerDir, { recursive: true })
  fs.mkdirSync(path.join(sandboxServerDir, 'temp'), { recursive: true })
  fs.mkdirSync(path.join(sandboxServerDir, 'data'), { recursive: true })
  fs.mkdirSync(path.join(sandboxServerDir, 'logs'), { recursive: true })
  return { root, sandboxServerDir }
}

function loadStubbedSweeper(sandboxServerDir) {
  const supabasePath = require.resolve('@supabase/supabase-js', { paths: [SERVER_DIR] })
  const raw = fs.readFileSync(SWEEPER_SOURCE_PATH, 'utf8')
  const patched = raw
    .replace(
      "require('@supabase/supabase-js')",
      `require(${JSON.stringify(supabasePath)})`,
    )
    .replace(
      "require('./sqlite-shadow-store.js')",
      `require(${JSON.stringify(SHADOW_STORE_PATH)})`,
    )
    .replace(
      "const SERVER_DIR = path.join(__dirname, '..')",
      `const SERVER_DIR = ${JSON.stringify(sandboxServerDir)}`,
    )

  const stubPath = path.join(sandboxServerDir, 'retention-sweeper.stub.js')
  fs.writeFileSync(stubPath, patched)
  delete require.cache[stubPath]
  return require(stubPath)
}

function writeAgedFile(targetPath, sizeBytes, mtimeMs) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, Buffer.alloc(sizeBytes, 'x'))
  fs.utimesSync(targetPath, new Date(mtimeMs), new Date(mtimeMs))
}

function walkAllFiles(roots) {
  const results = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    const stack = [root]
    while (stack.length) {
      const current = stack.pop()
      const entries = fs.readdirSync(current, { withFileTypes: true })
      for (const entry of entries) {
        const absolute = path.join(current, entry.name)
        if (entry.isDirectory()) stack.push(absolute)
        else results.push(absolute)
      }
    }
  }
  return results
}

function seedSyntheticJobs(nowMs) {
  const shadowStore = require(SHADOW_STORE_PATH)
  const originalListShadowJobs = shadowStore.listShadowJobs
  const originalDeleteShadowJob = shadowStore.deleteShadowJob
  const originalVerifyShadowJobDeleted = shadowStore.verifyShadowJobDeleted

  const jobs = [
    {
      id: 'job-complete-expired',
      title: 'Old Complete Job',
      status: 'complete',
      source_url: 'http://localhost:3001/serve/expired-source.mp4',
      created_at: new Date(nowMs - 40 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(nowMs - 40 * 24 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(nowMs - 40 * 24 * 60 * 60 * 1000).toISOString(),
      progress: { completedAt: new Date(nowMs - 40 * 24 * 60 * 60 * 1000).toISOString() },
    },
    {
      id: 'job-complete-fresh',
      title: 'Fresh Complete Job',
      status: 'complete',
      source_url: 'http://localhost:3001/serve/fresh-source.mp4',
      created_at: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
      completed_at: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
      progress: { completedAt: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString() },
    },
    {
      id: 'job-failed-expired',
      title: 'Old Failed Job',
      status: 'failed',
      source_url: null,
      created_at: new Date(nowMs - 72 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(nowMs - 72 * 60 * 60 * 1000).toISOString(),
      progress: {},
    },
    {
      id: 'job-failed-fresh',
      title: 'Fresh Failed Job',
      status: 'failed',
      source_url: null,
      created_at: new Date(nowMs - 6 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(nowMs - 6 * 60 * 60 * 1000).toISOString(),
      progress: {},
    },
    {
      id: 'job-processing',
      title: 'Active Processing Job',
      status: 'processing',
      source_url: 'http://localhost:3001/serve/active-source.mp4',
      created_at: new Date(nowMs - 10 * 60 * 1000).toISOString(),
      updated_at: new Date(nowMs - 10 * 60 * 1000).toISOString(),
      progress: { progress: 'queued' },
    },
  ]

  shadowStore.listShadowJobs = () => jobs
  shadowStore.deleteShadowJob = (jobId) => {
    const index = jobs.findIndex((job) => job.id === jobId)
    if (index >= 0) jobs.splice(index, 1)
  }
  shadowStore.verifyShadowJobDeleted = (jobId) => ({
    ok: !jobs.some((job) => job.id === jobId),
    jobId,
  })

  return {
    jobs,
    restore() {
      shadowStore.listShadowJobs = originalListShadowJobs
      shadowStore.deleteShadowJob = originalDeleteShadowJob
      shadowStore.verifyShadowJobDeleted = originalVerifyShadowJobDeleted
    },
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const { root: sandboxRoot, sandboxServerDir } = makeSandbox()
  let synthetic = null

  try {
    const sweeper = loadStubbedSweeper(sandboxServerDir)

    const nowMs = Date.now()
    synthetic = seedSyntheticJobs(nowMs)

    const tempDir = path.join(sandboxServerDir, 'temp')
    const dataDir = path.join(sandboxServerDir, 'data')

    writeAgedFile(path.join(tempDir, 'expired-source.mp4'), 2048, nowMs - 40 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'active-source.mp4'), 2048, nowMs - 40 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'unreferenced-old.mp4'), 4096, nowMs - 20 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'fresh-source.mp4'), 1024, nowMs - 1 * 24 * 60 * 60 * 1000)

    writeAgedFile(path.join(tempDir, 'thumb-cache', 'thumb-old.jpg'), 512, nowMs - 10 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'thumb-cache', 'thumb-new.jpg'), 512, nowMs - 1 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'transcription-cache', 'old.json'), 256, nowMs - 14 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'transcription-cache', 'new.json'), 256, nowMs - 1 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'transcriptions', 'old-transcript.json'), 256, nowMs - 14 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'transcriptions', 'fresh-transcript.json'), 256, nowMs - 1 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(dataDir, 'exports-temp', 'old-export.mp4'), 1024, nowMs - 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(dataDir, 'exports-temp', 'fresh-export.mp4'), 1024, nowMs - 1 * 60 * 60 * 1000)
    writeAgedFile(path.join(dataDir, 'source-cache', 'old-source-cache.json'), 128, nowMs - 14 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(dataDir, 'source-cache', 'fresh-source-cache.json'), 128, nowMs - 1 * 24 * 60 * 60 * 1000)

    const beforeFiles = walkAllFiles([tempDir, dataDir])

    const report = await sweeper.runRetentionSweep({
      apply,
      reason: apply ? 'smoke-apply' : 'smoke-dry-run',
      source: 'smoke-test',
    })

    assert(report.apply === apply, `expected report.apply=${apply}`)
    assert(report.phase === (apply ? 'phase5-apply' : 'phase4-dry-run'), 'unexpected phase')
    assert(report.jobStore === 'sqlite', 'jobStore should be sqlite in this smoke')
    assert(report.policies.completeRetentionDays === 7, 'completeRetentionDays should be 7')
    assert(report.policies.failedRetentionHours === 48, 'failedRetentionHours should be 48')
    assert(report.policies.sourceCacheRetentionDays === 7, 'sourceCacheRetentionDays should be 7')
    assert(report.policies.exportTempRetentionHours === 12, 'exportTempRetentionHours should be 12')
    assert(report.policies.cacheHardCapGB === 10, 'cacheHardCapGB should be 10 (GB)')
    assert(report.policies.cacheWarningGB === 8, 'cacheWarningGB should be 8 (GB)')

    assert(report.jobs.expiredJobIds.includes('job-complete-expired'), 'expired complete job must be candidate')
    assert(report.jobs.expiredJobIds.includes('job-failed-expired'), 'expired failed job must be candidate')
    assert(!report.jobs.expiredJobIds.includes('job-complete-fresh'), 'fresh complete job must NOT be candidate')
    assert(!report.jobs.expiredJobIds.includes('job-failed-fresh'), 'fresh failed job must NOT be candidate')
    assert(!report.jobs.expiredJobIds.includes('job-processing'), 'processing job must NEVER be candidate')

    const rootSampleNames = report.candidates.expiredRootSources.samples.map((entry) => path.basename(entry.relativePath))
    assert(rootSampleNames.includes('expired-source.mp4'), 'expired source file should be in expiredRootSources')
    assert(rootSampleNames.includes('unreferenced-old.mp4'), 'aged unreferenced file should be in expiredRootSources')
    assert(!rootSampleNames.includes('active-source.mp4'), 'referenced active-source.mp4 must NOT be in expiredRootSources')
    assert(!rootSampleNames.includes('fresh-source.mp4'), 'fresh source file must NOT be in expiredRootSources')

    const thumbSampleNames = report.candidates.thumbCache.samples.map((entry) => path.basename(entry.relativePath))
    assert(thumbSampleNames.includes('thumb-old.jpg'), 'aged thumb should be candidate')
    assert(!thumbSampleNames.includes('thumb-new.jpg'), 'fresh thumb must NOT be candidate')

    const transcriptCacheSampleNames = report.candidates.transcriptionCache.samples.map((entry) => path.basename(entry.relativePath))
    assert(transcriptCacheSampleNames.includes('old.json'), 'aged transcription cache entry should be candidate')
    assert(!transcriptCacheSampleNames.includes('new.json'), 'fresh transcription cache entry must NOT be candidate')

    const transcriptionSampleNames = report.candidates.transcriptions.samples.map((entry) => path.basename(entry.relativePath))
    assert(transcriptionSampleNames.includes('old-transcript.json'), 'aged transcription file should be candidate')
    assert(!transcriptionSampleNames.includes('fresh-transcript.json'), 'fresh transcription file must NOT be candidate')

    const exportSampleNames = report.candidates.exportTemp.samples.map((entry) => path.basename(entry.relativePath))
    assert(exportSampleNames.includes('old-export.mp4'), 'aged export should be candidate')
    assert(!exportSampleNames.includes('fresh-export.mp4'), 'fresh export must NOT be candidate')

    const sourceCacheSampleNames = report.candidates.sourceCache.samples.map((entry) => path.basename(entry.relativePath))
    assert(sourceCacheSampleNames.includes('old-source-cache.json'), 'aged source cache entry should be candidate')
    assert(!sourceCacheSampleNames.includes('fresh-source-cache.json'), 'fresh source cache entry must NOT be candidate')

    assert(typeof report.budget.currentCacheGB === 'number', 'budget.currentCacheGB should be a number')
    assert(report.budget.status === 'ok', `budget status should be ok, got ${report.budget.status}`)

    assert(report.reportPath && fs.existsSync(report.reportPath), 'report snapshot file must exist on disk')
    const summaryLogPath = path.join(sandboxServerDir, 'logs', 'retention-sweeper.jsonl')
    assert(fs.existsSync(summaryLogPath), 'retention-sweeper.jsonl must be written')
    const lines = fs.readFileSync(summaryLogPath, 'utf8').split('\n').filter(Boolean)
    assert(lines.length >= 1, 'summary log must contain at least one JSONL line')
    const lastLine = JSON.parse(lines[lines.length - 1])
    assert(lastLine.apply === apply, 'summary log entry apply flag mismatch')
    assert(lastLine.phase === (apply ? 'phase5-apply' : 'phase4-dry-run'), 'summary log phase mismatch')

    const afterFiles = walkAllFiles([tempDir, dataDir])

    if (!apply) {
      assert(
        beforeFiles.length === afterFiles.length,
        `expected zero file deletions, before=${beforeFiles.length} after=${afterFiles.length}`,
      )
      for (const beforeFile of beforeFiles) {
        assert(fs.existsSync(beforeFile), `file ${beforeFile} was deleted — dry-run must never delete`)
      }
      assert(!report.applied, 'dry-run should not include applied deletion results')
    } else {
      assert(report.applied, 'apply mode should include applied deletion results')
      assert(report.applied.deletedJobCount === 2, `expected 2 expired jobs deleted, got ${report.applied.deletedJobCount}`)
      assert(report.applied.deletedFileCount === 7, `expected 7 expired files deleted, got ${report.applied.deletedFileCount}`)
      assert(report.applied.errorCount === 0, `expected zero deletion errors, got ${report.applied.errorCount}`)
      assert(!synthetic.jobs.some((job) => job.id === 'job-complete-expired'), 'expired complete job should be removed')
      assert(!synthetic.jobs.some((job) => job.id === 'job-failed-expired'), 'expired failed job should be removed')
      assert(synthetic.jobs.some((job) => job.id === 'job-complete-fresh'), 'fresh complete job should remain')
      assert(synthetic.jobs.some((job) => job.id === 'job-failed-fresh'), 'fresh failed job should remain')
      assert(synthetic.jobs.some((job) => job.id === 'job-processing'), 'processing job should remain')

      assert(!fs.existsSync(path.join(tempDir, 'expired-source.mp4')), 'expired source should be deleted in apply mode')
      assert(!fs.existsSync(path.join(tempDir, 'unreferenced-old.mp4')), 'aged unreferenced root file should be deleted')
      assert(!fs.existsSync(path.join(tempDir, 'thumb-cache', 'thumb-old.jpg')), 'aged thumb should be deleted')
      assert(!fs.existsSync(path.join(tempDir, 'transcription-cache', 'old.json')), 'aged transcription cache should be deleted')
      assert(!fs.existsSync(path.join(tempDir, 'transcriptions', 'old-transcript.json')), 'aged transcription file should be deleted')
      assert(!fs.existsSync(path.join(dataDir, 'exports-temp', 'old-export.mp4')), 'aged export should be deleted')
      assert(!fs.existsSync(path.join(dataDir, 'source-cache', 'old-source-cache.json')), 'aged source cache file should be deleted')

      assert(fs.existsSync(path.join(tempDir, 'active-source.mp4')), 'active referenced source must remain')
      assert(fs.existsSync(path.join(tempDir, 'fresh-source.mp4')), 'fresh source must remain')
      assert(fs.existsSync(path.join(tempDir, 'thumb-cache', 'thumb-new.jpg')), 'fresh thumb must remain')
      assert(fs.existsSync(path.join(tempDir, 'transcription-cache', 'new.json')), 'fresh transcription cache entry must remain')
      assert(fs.existsSync(path.join(tempDir, 'transcriptions', 'fresh-transcript.json')), 'fresh transcription file must remain')
      assert(fs.existsSync(path.join(dataDir, 'exports-temp', 'fresh-export.mp4')), 'fresh export must remain')
      assert(fs.existsSync(path.join(dataDir, 'source-cache', 'fresh-source-cache.json')), 'fresh source cache file must remain')
      assert(afterFiles.length < beforeFiles.length, 'apply mode should remove files from disk')
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          apply,
          phase: report.phase,
          expiredJobs: report.jobs.expired,
          liveJobs: report.jobs.live,
          deletedJobCount: report.applied?.deletedJobCount || 0,
          deletedFileCount: report.applied?.deletedFileCount || 0,
          totalCandidateGB: report.candidates.totalCandidateGB,
          budgetStatus: report.budget.status,
          snapshot: report.reportPath,
        },
        null,
        2,
      ),
    )
  } finally {
    try {
      if (synthetic && typeof synthetic.restore === 'function') synthetic.restore()
    } catch {}
    try {
      fs.rmSync(sandboxRoot, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
