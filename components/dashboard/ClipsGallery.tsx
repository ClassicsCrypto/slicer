'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { createSupabaseClient } from '@/lib/supabase'
import type { Job, JobStatus, AIFocus, Clip } from '@/types'

const AI_FOCUS_META: Record<AIFocus, { label: string; icon: string; color: string }> = {
  funny_moments:  { label: 'Funny',    icon: '😂', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  kill_streaks:   { label: 'Kills',    icon: '💀', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  intense_action: { label: 'Action',   icon: '🔥', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  big_plays:      { label: 'Big Play', icon: '🏆', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  reactions:      { label: 'Reaction', icon: '😱', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  key_dialogue:   { label: 'Dialogue', icon: '🗣️', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  hype_moments:   { label: 'Hype',     icon: '⚡', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  fails:          { label: 'Fail',     icon: '💥', color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
}

function CategoryTags({ categories }: { categories: AIFocus[] | null | undefined }) {
  if (!categories || categories.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {categories.map((cat) => {
        const meta = AI_FOCUS_META[cat]
        if (!meta) return null
        return (
          <span
            key={cat}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}
            title={`AI matched: ${meta.label}`}
          >
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
          </span>
        )
      })}
    </div>
  )
}

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

  // Refetch when window gets focus (handles tab switching)
  useEffect(() => {
    const onFocus = () => fetchJobs()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchJobs])

  // Auto-poll any jobs that are still processing
  useEffect(() => {
    const processingJobs = jobs.filter(j => j.status === 'processing' || j.status === 'pending')
    if (processingJobs.length === 0) return

    const pollOne = async (job: Job) => {
      try {
        const supabase = createSupabaseClient()
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        const url = userId ? `/api/jobs/${job.id}/poll?userId=${userId}` : `/api/jobs/${job.id}/poll`
        const res = await fetch(url)
        if (!res.ok) return
        const updated = await res.json()
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...updated } : j))
      } catch { /* ignore */ }
    }

    const interval = setInterval(() => {
      processingJobs.forEach(pollOne)
    }, 8000)

    // Also poll immediately once
    processingJobs.forEach(pollOne)

    return () => clearInterval(interval)
  }, [jobs.map(j => `${j.id}:${j.status}`).join(',')])

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
    setDeletingId(null)
    setConfirmDelete(null)
    setSelected(new Set())
    // Always refetch from server after delete
    await fetchJobs()
  }

  const deleteSelected = async () => {
    const supabase = createSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    for (const id of Array.from(selected)) {
      await fetch(`/api/jobs/${id}?userId=${userId || ''}`, { method: 'DELETE' })
    }
    clearSelection()
    // Always refetch from server after delete
    await fetchJobs()
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

  const completedJobs = jobs.filter(j => j.status === 'complete' || j.status === 'failed')
  const activeJobs = jobs.filter(j => j.status === 'processing' || j.status === 'pending')

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

  // Reusable processing card renderer
  const renderProcessingCard = (job: Job) => {
    const prog = job.progress || {}
    const renderPct = (prog as Record<string, unknown>).renderPct as number | undefined
    const est = prog.estimatedSecondsRemaining
    const completedCount = (prog as Record<string, unknown>).completedCount as number | undefined
    const totalRenders = ((prog as Record<string, unknown>).renderIds as string[] | undefined)?.length
    const hasRealProgress = renderPct != null && renderPct > 0
    return (
      <div key={job.id} className="bg-surface border border-primary/30 rounded-2xl p-4 flex items-center gap-4 mb-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate">{job.title || 'Untitled video'}</p>
          <p className="text-muted text-xs mt-0.5">
            {completedCount != null && totalRenders != null && totalRenders > 0
              ? `${completedCount} / ${totalRenders} clips done`
              : 'Rendering clips with Shotstack…'}
          </p>
          {/* Use indeterminate shimmer until we have real % from Shotstack */}
          <div className="mt-2 w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            {hasRealProgress ? (
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-700"
                style={{ width: `${renderPct}%` }}
              />
            ) : (
              <div className="h-full w-1/3 bg-gradient-to-r from-primary to-accent rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]"
                style={{ animation: 'shimmer 1.5s ease-in-out infinite', backgroundSize: '200% 100%' }}
              />
            )}
          </div>
        </div>
        <div className="flex-shrink-0 text-right min-w-[40px]">
          {est != null && est > 0 ? (
            <p className="text-xs text-muted">~{est >= 60 ? `${Math.ceil(est / 60)}m` : `${est}s`}</p>
          ) : null}
          {hasRealProgress && (
            <p className="text-xs text-primary font-semibold mt-1">{renderPct}%</p>
          )}
        </div>
      </div>
    )
  }

  // Only active jobs, no completed ones yet — show processing-only view
  if (activeJobs.length > 0 && completedJobs.length === 0) {
    return (
      <div className="py-6 px-4">
        <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">⚡ In Progress</p>
        {activeJobs.map(renderProcessingCard)}
        <p className="text-xs text-muted text-center mt-6">
          This page polls every 8 seconds — clips will appear here automatically when ready 🎬
        </p>
      </div>
    )
  }

  return (
    <div className="py-6 px-4">
      {/* Bulk actions bar */}
      {completedJobs.length > 0 && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button onClick={selectAll} className="text-xs text-primary hover:text-accent transition-colors font-semibold">
            Select All ({completedJobs.length})
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

      {/* Processing job cards — shown at the top while rendering */}
      {activeJobs.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">⚡ In Progress</p>
          {activeJobs.map(renderProcessingCard)}
        </div>
      )}

      {/* Job cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {completedJobs.map((job) => (
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
              <div className="flex items-center gap-2 text-xs text-muted mb-2">
                <span>{formatDate(job.created_at)}</span>
                <span>·</span>
                <Badge variant="default">{job.clips?.length ?? 0} clips</Badge>
              </div>
              {/* Show unique categories across all clips for this job */}
              {(() => {
                const allCats = Array.from(new Set(
                  (job.clips || []).flatMap(c => c.matched_categories || [])
                )) as AIFocus[]
                return allCats.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {allCats.slice(0, 4).map((cat) => {
                      const meta = AI_FOCUS_META[cat]
                      if (!meta) return null
                      return (
                        <span key={cat} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border ${meta.color}`}>
                          {meta.icon} {meta.label}
                        </span>
                      )
                    })}
                    {allCats.length > 4 && (
                      <span className="text-xs text-muted self-center">+{allCats.length - 4}</span>
                    )}
                  </div>
                ) : null
              })()}

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
            {(previewJob.status === 'processing' || previewJob.status === 'pending') && (!previewJob.clips || previewJob.clips.length === 0) && (
              <div className="py-8 text-center space-y-3">
                <div className="flex justify-center">
                  <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
                <p className="text-white font-semibold text-sm">Rendering your clips…</p>
                <p className="text-muted text-xs max-w-xs mx-auto">Shotstack is processing your video. This usually takes 2–5 minutes. This modal will update automatically.</p>
                {/* Skeleton clip placeholders */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {Array.from({ length: previewJob.options?.clipCount ?? 2 }).map((_, i) => (
                    <div key={i} className="bg-background rounded-xl border border-white/10 overflow-hidden">
                      <div className="h-36 bg-white/5 animate-pulse flex items-center justify-center">
                        <span className="text-2xl opacity-20">🎬</span>
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="h-3 bg-white/10 rounded animate-pulse w-2/3" />
                        <div className="h-2 bg-white/5 rounded animate-pulse w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="text-xs text-muted">
                          <p className="text-white font-semibold mb-0.5">Clip {i + 1}</p>
                          {clip.start_time != null && clip.end_time != null && (
                            <p>{clip.start_time}s – {clip.end_time}s · {clip.duration}s</p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
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
                      {/* Category tags — why the AI picked this clip */}
                      <CategoryTags categories={clip.matched_categories} />
                      {/* AI reason tooltip */}
                      {clip.ai_reason && (
                        <p className="text-xs text-muted mt-1.5 italic leading-snug">
                          💡 {clip.ai_reason}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              previewJob.status !== 'processing' && previewJob.status !== 'pending' && (
                <div className="py-10 text-center">
                  <p className="text-muted text-sm">No clips found for this job</p>
                  <p className="text-xs text-muted/60 mt-1">Clips may have expired (Shotstack sandbox links last 24h)</p>
                </div>
              )
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
