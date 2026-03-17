'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { createSupabaseClient } from '@/lib/supabase'
import type { Job, JobStatus } from '@/types'

function statusBadge(status: JobStatus) {
  const map: Record<JobStatus, { variant: 'success' | 'warning' | 'error' | 'info' | 'default'; label: string }> = {
    complete: { variant: 'success', label: '✅ Complete' },
    processing: { variant: 'info', label: '⚡ Processing' },
    pending: { variant: 'warning', label: '⏳ Pending' },
    failed: { variant: 'error', label: '❌ Failed' },
  }
  const cfg = map[status] || map.pending
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface ClipsGalleryProps {
  onUploadNew?: () => void
}

export default function ClipsGallery({ onUploadNew }: ClipsGalleryProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewJob, setPreviewJob] = useState<Job | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const supabase = createSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()

    // Use userId as query param to avoid REQUEST_HEADER_TOO_LARGE from large JWTs
    const userId = session?.user?.id
    const url = userId ? `/api/jobs?userId=${userId}` : '/api/jobs'
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      setJobs(Array.isArray(data) ? data : [])
    } else {
      console.warn('Jobs fetch failed:', res.status, await res.text())
      setJobs([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(jobs.map((j) => j.id)))
  const clearSelection = () => setSelected(new Set())

  const deleteJob = async (id: string) => {
    setDeletingId(id)
    const supabase = createSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    await fetch(`/api/jobs/${id}?userId=${userId || ''}`, { method: 'DELETE' })
    setJobs((prev) => prev.filter((j) => j.id !== id))
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
    setDeletingId(null)
    setConfirmDelete(null)
  }

  const deleteSelected = async () => {
    const supabase = createSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    for (const id of Array.from(selected)) {
      await fetch(`/api/jobs/${id}?userId=${userId || ''}`, { method: 'DELETE' })
    }
    setJobs((prev) => prev.filter((j) => !selected.has(j.id)))
    clearSelection()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin w-8 h-8 text-primary" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="text-6xl mb-4">🎬</div>
        <h3 className="text-xl font-bold text-white mb-2">No clips yet</h3>
        <p className="text-muted mb-6 max-w-sm">Upload your first video and let the MCV AI create viral-ready clips for you.</p>
        <Button variant="primary" onClick={onUploadNew}>
          Upload a Video
        </Button>
      </div>
    )
  }

  return (
    <div className="py-6 px-4">
      {/* Bulk actions bar */}
      {jobs.length > 0 && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button onClick={selectAll} className="text-xs text-primary hover:text-accent transition-colors font-semibold">
            Select All ({jobs.length})
          </button>
          {selected.size > 0 && (
            <>
              <span className="text-white/20">|</span>
              <button onClick={clearSelection} className="text-xs text-muted hover:text-white transition-colors">
                Clear ({selected.size})
              </button>
              <Button variant="danger" size="sm" onClick={deleteSelected}>
                Delete Selected
              </Button>
            </>
          )}
          <button onClick={fetchJobs} className="ml-auto text-xs text-muted hover:text-primary transition-colors">
            ↻ Refresh
          </button>
        </div>
      )}

      {/* Job cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {jobs.map((job) => (
          <div
            key={job.id}
            className={`relative bg-surface rounded-2xl border overflow-hidden transition-all duration-200 ${
              selected.has(job.id) ? 'border-primary glow-teal' : 'border-white/10 hover:border-white/20'
            }`}
          >
            {/* Thumbnail */}
            <div
              className="relative h-40 bg-white/5 flex items-center justify-center cursor-pointer group"
              onClick={() => setPreviewJob(job)}
            >
              <div className="text-4xl opacity-40 group-hover:opacity-60 transition-opacity">🎬</div>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-full bg-primary/80 flex items-center justify-center">
                  <svg className="w-5 h-5 text-background ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
              {/* Select checkbox */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleSelect(job.id) }}
                className={`absolute top-2 left-2 w-5 h-5 rounded border-2 transition-all ${
                  selected.has(job.id) ? 'bg-primary border-primary' : 'border-white/40 hover:border-primary'
                }`}
              >
                {selected.has(job.id) && (
                  <svg className="w-3 h-3 text-background mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </div>

            {/* Info */}
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-white truncate flex-1">
                  {job.title || 'Untitled video'}
                </h4>
                {statusBadge(job.status)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted mb-4">
                <span>{formatDate(job.created_at)}</span>
                <span>·</span>
                <Badge variant="default">{job.clips?.length ?? 0} clips</Badge>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => setPreviewJob(job)}>
                  👁 Preview
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deletingId === job.id}
                  onClick={() => setConfirmDelete(job.id)}
                >
                  🗑
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      <Modal
        isOpen={previewJob !== null}
        onClose={() => setPreviewJob(null)}
        title={previewJob?.title || 'Preview'}
        size="xl"
      >
        {previewJob && (
          <div className="space-y-4">
            {/* Job meta */}
            <div className="flex items-center gap-3 flex-wrap text-sm">
              {statusBadge(previewJob.status)}
              <span className="text-muted">{formatDate(previewJob.created_at)}</span>
              {previewJob.options?.platformFormat && (
                <Badge variant="default">{previewJob.options.platformFormat}</Badge>
              )}
              <span className="text-muted">{previewJob.clips?.length ?? 0} clips</span>
            </div>

            {/* Clips grid */}
            {previewJob.clips && previewJob.clips.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
                {previewJob.clips.map((clip, i) => (
                  <div key={clip.id} className="bg-background rounded-xl border border-white/10 overflow-hidden">
                    {/* Clip player — shows video if r2_key has a URL, otherwise placeholder */}
                    <div className="relative bg-black h-36 flex items-center justify-center">
                      {clip.r2_key && clip.r2_key.startsWith('http') ? (
                        <video
                          src={clip.r2_key}
                          controls
                          className="w-full h-full object-cover"
                          preload="metadata"
                        />
                      ) : (
                        <div className="text-center">
                          <div className="text-3xl mb-1">🎬</div>
                          <p className="text-muted text-xs">Clip {i + 1}</p>
                        </div>
                      )}
                    </div>
                    {/* Clip info + actions */}
                    <div className="p-3 flex items-center justify-between gap-2">
                      <div className="text-xs text-muted">
                        <p className="text-white font-semibold mb-0.5">Clip {i + 1}</p>
                        {clip.start_time != null && clip.end_time != null && (
                          <p>{clip.start_time}s – {clip.end_time}s · {clip.duration}s</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {clip.r2_key && clip.r2_key.startsWith('http') ? (
                          <a
                            href={clip.r2_key}
                            download={`slicer-clip-${i + 1}.mp4`}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary/20 hover:bg-primary/40 text-primary rounded-lg text-xs font-semibold transition-colors"
                          >
                            ⬇ Download
                          </a>
                        ) : (
                          <button
                            disabled
                            title="Available after real processing"
                            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 text-muted/40 rounded-lg text-xs font-semibold cursor-not-allowed"
                          >
                            ⬇ Download
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (previewJob) {
                              setPreviewJob({
                                ...previewJob,
                                clips: previewJob.clips?.filter(c => c.id !== clip.id)
                              })
                            }
                          }}
                          title="Delete clip"
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-semibold transition-colors"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-muted text-sm">
                  {previewJob.status === 'processing' || previewJob.status === 'pending'
                    ? '⚡ Still processing — check back in a moment'
                    : 'No clips found for this job'}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Delete Modal */}
      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Delete Job" size="sm">
        <p className="text-muted mb-6">This will permanently delete the job and all associated clips. This cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={deletingId !== null}
            onClick={() => confirmDelete && deleteJob(confirmDelete)}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
