import 'server-only'

import {
  deleteShadowJob,
  getShadowParityLogPath,
  isSqliteShadowEnabled,
  upsertShadowJob,
  upsertShadowJobs,
  verifyShadowJobDeleted,
  verifyShadowJobParity,
} from '@/lib/job-store/sqlite'

function warnOnParityMismatch(result: { ok: boolean; jobId: string; mismatches?: Array<{ field: string }> }, context: string) {
  if (result.ok) return
  const fields = (result.mismatches ?? []).map((mismatch) => mismatch.field).join(', ') || 'unknown'
  console.warn(`[shadow-sqlite] Parity mismatch for ${result.jobId} after ${context}. Fields: ${fields}. Log: ${getShadowParityLogPath()}`)
}

export async function mirrorJobToShadowSqlite(job: any, context = 'unknown') {
  if (!isSqliteShadowEnabled() || !job?.id) return { ok: true, jobId: String(job?.id || '') }
  try {
    upsertShadowJob(job)
    const result = verifyShadowJobParity(job, { source: context, action: 'upsert' })
    warnOnParityMismatch(result, context)
    return result
  } catch (error) {
    console.error('[shadow-sqlite] Failed to mirror job', job?.id, error)
    return { ok: false, jobId: String(job?.id || ''), error }
  }
}

export async function mirrorJobsToShadowSqlite(jobs: any[], context = 'unknown') {
  if (!isSqliteShadowEnabled() || !Array.isArray(jobs) || jobs.length === 0) return []
  try {
    upsertShadowJobs(jobs)
    const results = jobs.map((job) => verifyShadowJobParity(job, { source: context, action: 'upsert' }))
    for (const result of results) warnOnParityMismatch(result, context)
    return results
  } catch (error) {
    console.error('[shadow-sqlite] Failed to mirror jobs batch', error)
    return []
  }
}

export async function removeJobFromShadowSqlite(jobId: string, context = 'unknown') {
  if (!isSqliteShadowEnabled() || !jobId) return { ok: true, jobId }
  try {
    deleteShadowJob(jobId)
    const result = verifyShadowJobDeleted(jobId, { source: context, action: 'delete' })
    if (!result.ok) {
      console.warn(`[shadow-sqlite] Delete parity mismatch for ${jobId} after ${context}. Log: ${getShadowParityLogPath()}`)
    }
    return result
  } catch (error) {
    console.error('[shadow-sqlite] Failed to delete mirrored job', jobId, error)
    return { ok: false, jobId, error }
  }
}
