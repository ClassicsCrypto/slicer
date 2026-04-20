import 'server-only'

import { createServerClient } from '@/lib/supabase'
import { deleteShadowJob, getShadowJob, listShadowJobs, upsertShadowJob } from '@/lib/job-store/sqlite'
import { mirrorJobToShadowSqlite, mirrorJobsToShadowSqlite, removeJobFromShadowSqlite } from '@/lib/job-store/shadow'

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
    const existing = getShadowJob(jobId)
    if (!existing) return null
    const nextJob = {
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
    }
    upsertShadowJob(nextJob)
    return getShadowJob(jobId)
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
