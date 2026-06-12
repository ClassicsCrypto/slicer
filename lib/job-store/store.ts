import 'server-only'

import { createServerClient } from '@/lib/supabase'
import { deleteShadowJob, getShadowJob, listShadowJobs, listShadowJobsForUsers, mutateShadowJob, upsertShadowJob } from '@/lib/job-store/sqlite'
import { mirrorJobToShadowSqlite, mirrorJobsToShadowSqlite, removeJobFromShadowSqlite } from '@/lib/job-store/shadow'
import { getClipStableId } from '@/lib/clip-id'

export type JobStoreKind = 'supabase' | 'sqlite'

export function getJobStoreKind(): JobStoreKind {
  return process.env.SLICER_JOB_STORE === 'sqlite' ? 'sqlite' : 'supabase'
}

export function isSqliteJobStore() {
  return getJobStoreKind() === 'sqlite'
}

export function isSupabaseJobStore() {
  return getJobStoreKind() === 'supabase'
}

export async function listJobRecords(limit = 50, context = 'job-store/list') {
  if (isSqliteJobStore()) {
    return listShadowJobs(limit)
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  await mirrorJobsToShadowSqlite(data ?? [], `${context} seed`)
  return data ?? []
}

/**
 * Owner-scoped listing: the predicate runs in the database, so a user's jobs
 * can't be pushed out of view by other users' newer jobs (the old pattern
 * fetched the global newest N and filtered in JS).
 */
export async function listJobRecordsForUsers(userIds: string[], limit = 50, context = 'job-store/list-for-users') {
  if (!userIds.length) return []

  if (isSqliteJobStore()) {
    return listShadowJobsForUsers(userIds, limit)
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .in('user_id', userIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  await mirrorJobsToShadowSqlite(data ?? [], `${context} seed`)
  return data ?? []
}

/**
 * Locate the job owning a clip, scanning only the given users' most-recent
 * jobs. The predicate is a strict superset of both prior route variants
 * (stable-id match over normalized clips, and stable-id-or-raw-id match).
 */
export async function findJobByClipId(userIds: string[], clipId: string, scanLimit = 200, context = 'job-store/find-clip') {
  const jobs = await listJobRecordsForUsers(userIds, scanLimit, context)
  for (const job of jobs) {
    const clips = (job?.progress?.completedClips ?? []) as Array<Record<string, any>>
    const clip = clips.find((entry) => getClipStableId(entry as any) === clipId || entry?.id === clipId)
    if (clip) return { job, clip }
  }
  return null
}

export async function getJobRecord(jobId: string, context = 'job-store/get') {
  if (isSqliteJobStore()) {
    return getShadowJob(jobId)
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !data) return null
  await mirrorJobToShadowSqlite(data, `${context} mirror`)
  return data
}

export async function createJobRecord(job: Record<string, any>, context = 'job-store/create') {
  if (isSqliteJobStore()) {
    upsertShadowJob(job)
    return getShadowJob(String(job.id))
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('jobs')
    .insert(job)
    .select('*')
    .single()

  if (error) throw error
  await mirrorJobToShadowSqlite(data, `${context} mirror`)
  return data
}

export async function updateJobRecord(jobId: string, patch: Record<string, any>, context = 'job-store/update') {
  if (isSqliteJobStore()) {
    // Same merge as before, but the read now happens inside the transaction
    // so a concurrent writer can't be overwritten with a stale spread.
    return mutateShadowJob(jobId, (existing) => ({
      ...existing,
      ...patch,
      id: existing.id,
      user_id: patch.user_id ?? existing.user_id,
      progress: patch.progress ?? existing.progress,
      options: patch.options ?? existing.options,
      title: patch.title ?? existing.title,
      source_url: patch.source_url ?? existing.source_url,
      created_at: patch.created_at ?? existing.created_at,
      updated_at: patch.updated_at ?? existing.updated_at ?? new Date().toISOString(),
    }))
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .single()

  if (error || !data) return null
  await mirrorJobToShadowSqlite(data, `${context} mirror`)
  return data
}

/**
 * Read-merge-write where the merge itself needs the freshest row (votes,
 * clip edits, stale recovery). In sqlite mode the mutator runs inside a
 * BEGIN IMMEDIATE transaction; mutators must be synchronous and may return
 * null to skip the write (e.g. a stale-recovery re-check that no longer
 * applies). In supabase mode this degrades to the existing get→update
 * pattern (rollback store only).
 */
export async function mutateJobRecord(
  jobId: string,
  mutator: (existing: Record<string, any>) => Record<string, any> | null | undefined,
  context = 'job-store/mutate',
) {
  if (isSqliteJobStore()) {
    return mutateShadowJob(jobId, mutator)
  }

  const existing = await getJobRecord(jobId, `${context} fetch`)
  if (!existing) return null
  const next = mutator(existing)
  if (!next) return existing
  const { id: _id, ...patch } = next
  return updateJobRecord(jobId, patch, context)
}

export async function deleteJobRecord(jobId: string, context = 'job-store/delete') {
  if (isSqliteJobStore()) {
    deleteShadowJob(jobId)
    return { error: null }
  }

  const supabase = createServerClient()
  await supabase.from('clips').delete().eq('job_id', jobId)
  const { error } = await supabase.from('jobs').delete().eq('id', jobId)
  if (!error) await removeJobFromShadowSqlite(jobId, `${context} mirror`)
  return { error }
}
