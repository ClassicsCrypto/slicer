#!/usr/bin/env node
/**
 * Cross-process lost-update test for the transactional job store.
 *
 * Spawns two child processes that each apply N read-merge-write increments to
 * a DIFFERENT progress key of the SAME job via mutateShadowJob. If the
 * read-merge-write is not transactional, the whole-blob progress_json upsert
 * loses updates and the final counters come up short (this reliably failed
 * against the pre-transactional updateJob/updateJobRecord pattern).
 *
 * Usage: node scripts/job-state-concurrency-test.cjs
 * Exits 0 on pass, 1 on lost updates.
 */

const path = require('path')
const { fork } = require('child_process')

const store = require(path.join(__dirname, '..', 'server', 'lib', 'sqlite-shadow-store.js'))

const N = Number(process.env.SLICER_CONCURRENCY_TEST_N || 200)

if (process.env.SLICER_CONCURRENCY_TEST_CHILD) {
  const jobId = process.env.SLICER_CONCURRENCY_TEST_JOB
  const key = process.env.SLICER_CONCURRENCY_TEST_KEY
  for (let i = 0; i < N; i++) {
    store.mutateShadowJob(jobId, (job) => ({
      ...job,
      progress: { ...job.progress, [key]: (job.progress[key] || 0) + 1 },
      updated_at: new Date().toISOString(),
    }))
  }
  process.exit(0)
}

async function main() {
  const jobId = `concurrency-test-${process.pid}-${Date.now()}`
  const nowIso = new Date().toISOString()
  store.upsertShadowJob({
    id: jobId,
    user_id: '00000000-0000-0000-0000-000000000001',
    title: 'concurrency test',
    status: 'processing',
    options: {},
    progress: { inputKind: 'uploaded_file', a: 0, b: 0 },
    created_at: nowIso,
    updated_at: nowIso,
  })

  const child = (key) => new Promise((resolve, reject) => {
    const proc = fork(__filename, [], {
      env: {
        ...process.env,
        SLICER_CONCURRENCY_TEST_CHILD: '1',
        SLICER_CONCURRENCY_TEST_JOB: jobId,
        SLICER_CONCURRENCY_TEST_KEY: key,
      },
    })
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`child ${key} exited ${code}`))))
    proc.on('error', reject)
  })

  try {
    await Promise.all([child('a'), child('b')])
    const job = store.getShadowJob(jobId)
    const a = job?.progress?.a
    const b = job?.progress?.b
    const pass = a === N && b === N
    console.log(`progress.a = ${a}/${N}, progress.b = ${b}/${N} -> ${pass ? 'PASS (no lost updates)' : 'FAIL (lost updates)'}`)
    process.exit(pass ? 0 : 1)
  } finally {
    store.deleteShadowJob(jobId)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
