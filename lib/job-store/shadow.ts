import 'server-only'

import { deleteShadowJob, isSqliteShadowEnabled, upsertShadowJob, upsertShadowJobs } from '@/lib/job-store/sqlite'

export async function mirrorJobToShadowSqlite(job: any) {
  if (!isSqliteShadowEnabled() || !job?.id) return
  try {
    upsertShadowJob(job)
  } catch (error) {
    console.error('[shadow-sqlite] Failed to mirror job', job?.id, error)
  }
}

export async function mirrorJobsToShadowSqlite(jobs: any[]) {
  if (!isSqliteShadowEnabled() || !Array.isArray(jobs) || jobs.length === 0) return
  try {
    upsertShadowJobs(jobs)
  } catch (error) {
    console.error('[shadow-sqlite] Failed to mirror jobs batch', error)
  }
}

export async function removeJobFromShadowSqlite(jobId: string) {
  if (!isSqliteShadowEnabled() || !jobId) return
  try {
    deleteShadowJob(jobId)
  } catch (error) {
    console.error('[shadow-sqlite] Failed to delete mirrored job', jobId, error)
  }
}
