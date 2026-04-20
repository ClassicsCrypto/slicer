/**
 * Smoke test for Phase 4 retention sweeper (DRY-RUN only).
 *
 * Runs the sweeper against a disposable sandbox directory structure, seeds
 * synthetic aged jobs via a monkey-patch of sqliteShadowStore.listShadowJobs,
 * and verifies that:
 *   - the sweeper reports expired complete + failed jobs as candidates
 *   - the sweeper ignores processing jobs and recent jobs
 *   - aged thumb-cache / transcription-cache / exports-temp files show up
 *   - aged source files referenced by live jobs do NOT show up
 *   - nothing is deleted from disk
 *   - the sweeper writes a snapshot report and appends a summary log line
 *   - runRetentionSweep honors apply=false (no deletions)
 *
 * Run with:
 *   SLICER_JOB_STORE=sqlite node server/lib/retention-sweeper.smoke.js
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
  // Rewrite SERVER_DIR + relative requires to absolute paths so the sweeper
  // touches only the sandbox folders while still using the real (but
  // monkey-patched) shadow store module and the real @supabase/supabase-js
  // install that sits next to the project root, not the sandbox.
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
  return jobs
}

async function main() {
  const { root: sandboxRoot, sandboxServerDir } = makeSandbox()

  try {
    const sweeper = loadStubbedSweeper(sandboxServerDir)

    const nowMs = Date.now()
    seedSyntheticJobs(nowMs)

    const tempDir = path.join(sandboxServerDir, 'temp')
    const dataDir = path.join(sandboxServerDir, 'data')

    // Aged source files in temp root
    writeAgedFile(path.join(tempDir, 'expired-source.mp4'), 2048, nowMs - 40 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'active-source.mp4'), 2048, nowMs - 40 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'unreferenced-old.mp4'), 4096, nowMs - 20 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'fresh-source.mp4'), 1024, nowMs - 1 * 24 * 60 * 60 * 1000)

    // Aged and fresh entries in subfolders
    writeAgedFile(path.join(tempDir, 'thumb-cache', 'thumb-old.jpg'), 512, nowMs - 10 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'thumb-cache', 'thumb-new.jpg'), 512, nowMs - 1 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'transcription-cache', 'old.json'), 256, nowMs - 14 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(tempDir, 'transcription-cache', 'new.json'), 256, nowMs - 1 * 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(dataDir, 'exports-temp', 'old-export.mp4'), 1024, nowMs - 24 * 60 * 60 * 1000)
    writeAgedFile(path.join(dataDir, 'exports-temp', 'fresh-export.mp4'), 1024, nowMs - 1 * 60 * 60 * 1000)

    const beforeFiles = walkAllFiles([tempDir, dataDir])

    // Exercise runRetentionSweep (writes snapshot + appends summary log).
    const report = await sweeper.runRetentionSweep({ apply: false, reason: 'smoke', source: 'smoke-test' })

    // Report shape
    assert(report.apply === false, 'runRetentionSweep must default to apply=false')
    assert(report.phase === 'phase4-dry-run', 'phase should be phase4-dry-run')
    assert(report.jobStore === 'sqlite', 'jobStore should be sqlite in this smoke')
    assert(report.policies.completeRetentionDays === 7, 'completeRetentionDays should be 7')
    assert(report.policies.failedRetentionHours === 48, 'failedRetentionHours should be 48')
    assert(report.policies.sourceCacheRetentionDays === 7, 'sourceCacheRetentionDays should be 7')
    assert(report.policies.exportTempRetentionHours === 12, 'exportTempRetentionHours should be 12')
    assert(report.policies.cacheHardCapGB === 10, 'cacheHardCapGB should be 10 (GB)')
    assert(report.policies.cacheWarningGB === 8, 'cacheWarningGB should be 8 (GB)')

    // Jobs
    assert(report.jobs.expiredJobIds.includes('job-complete-expired'), 'expired complete job must be candidate')
    assert(report.jobs.expiredJobIds.includes('job-failed-expired'), 'expired failed job must be candidate')
    assert(!report.jobs.expiredJobIds.includes('job-complete-fresh'), 'fresh complete job must NOT be candidate')
    assert(!report.jobs.expiredJobIds.includes('job-failed-fresh'), 'fresh failed job must NOT be candidate')
    assert(!report.jobs.expiredJobIds.includes('job-processing'), 'processing job must NEVER be candidate')

    // Expired root sources: must flag expired+unreferenced files, not referenced+live or fresh
    const rootSampleNames = report.candidates.expiredRootSources.samples.map((entry) => path.basename(entry.relativePath))
    assert(rootSampleNames.includes('expired-source.mp4'), 'expired source file should be in expiredRootSources')
    assert(rootSampleNames.includes('unreferenced-old.mp4'), 'aged unreferenced file should be in expiredRootSources')
    assert(!rootSampleNames.includes('active-source.mp4'), 'referenced active-source.mp4 must NOT be in expiredRootSources')
    assert(!rootSampleNames.includes('fresh-source.mp4'), 'fresh source file must NOT be in expiredRootSources')

    // Thumb cache
    const thumbSampleNames = report.candidates.thumbCache.samples.map((entry) => path.basename(entry.relativePath))
    assert(thumbSampleNames.includes('thumb-old.jpg'), 'aged thumb should be candidate')
    assert(!thumbSampleNames.includes('thumb-new.jpg'), 'fresh thumb must NOT be candidate')

    // Transcription cache
    const transcriptSampleNames = report.candidates.transcriptionCache.samples.map((entry) => path.basename(entry.relativePath))
    assert(transcriptSampleNames.includes('old.json'), 'aged transcription cache entry should be candidate')
    assert(!transcriptSampleNames.includes('new.json'), 'fresh transcription cache entry must NOT be candidate')

    // Export temp
    const exportSampleNames = report.candidates.exportTemp.samples.map((entry) => path.basename(entry.relativePath))
    assert(exportSampleNames.includes('old-export.mp4'), 'aged export should be candidate')
    assert(!exportSampleNames.includes('fresh-export.mp4'), 'fresh export must NOT be candidate')

    // Budget block is populated and well under 10 GB with our synthetic bytes
    assert(typeof report.budget.currentCacheGB === 'number', 'budget.currentCacheGB should be a number')
    assert(report.budget.status === 'ok', `budget status should be ok, got ${report.budget.status}`)

    // Snapshot file + summary log line written
    assert(report.reportPath && fs.existsSync(report.reportPath), 'report snapshot file must exist on disk')
    const summaryLogPath = path.join(sandboxServerDir, 'logs', 'retention-sweeper.jsonl')
    assert(fs.existsSync(summaryLogPath), 'retention-sweeper.jsonl must be written')
    const lines = fs.readFileSync(summaryLogPath, 'utf8').split('\n').filter(Boolean)
    assert(lines.length >= 1, 'summary log must contain at least one JSONL line')
    const lastLine = JSON.parse(lines[lines.length - 1])
    assert(lastLine.apply === false, 'summary log entry must report apply=false')
    assert(lastLine.phase === 'phase4-dry-run', 'summary log entry must report phase4-dry-run')

    // NOTHING was deleted
    const afterFiles = walkAllFiles([tempDir, dataDir])
    assert(
      beforeFiles.length === afterFiles.length,
      `expected zero file deletions, before=${beforeFiles.length} after=${afterFiles.length}`,
    )
    for (const beforeFile of beforeFiles) {
      assert(fs.existsSync(beforeFile), `file ${beforeFile} was deleted — dry-run must never delete`)
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: report.apply === false,
          phase: report.phase,
          expiredJobs: report.jobs.expired,
          liveJobs: report.jobs.live,
          expiredRootSources: report.candidates.expiredRootSources.count,
          thumbCandidates: report.candidates.thumbCache.count,
          transcriptionCandidates: report.candidates.transcriptionCache.count,
          exportTempCandidates: report.candidates.exportTemp.count,
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
      fs.rmSync(sandboxRoot, { recursive: true, force: true })
    } catch {}
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
