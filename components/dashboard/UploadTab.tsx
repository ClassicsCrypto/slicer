'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Button from '@/components/ui/Button'
import OptionsModal from './OptionsModal'
import ProcessingView from './ProcessingView'
import { createSupabaseClient } from '@/lib/supabase'
import type { ProcessingOptions } from '@/types'

const ACCEPTED_TYPES = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm'],
  'video/x-matroska': ['.mkv'],
}

const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2GB

interface UploadTabProps {
  onJobCreated: (jobId: string) => void
}

export default function UploadTab({ onJobCreated }: UploadTabProps) {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [showOptions, setShowOptions] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [optionsLoading, setOptionsLoading] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[], rejections: import('react-dropzone').FileRejection[]) => {
    setError(null)
    if (rejections.length > 0) {
      setError(rejections[0].errors[0]?.message || 'Invalid file')
      return
    }
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0])
      setUrl('')
      setUrlInput('')
      setShowOptions(true)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    maxFiles: 1,
    noClick: true,
  })

  const handleUrlPaste = () => {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    if (!trimmed.match(/^https?:\/\/.+/)) {
      setError('Please enter a valid URL')
      return
    }
    setError(null)
    setUrl(trimmed)
    setFile(null)
    setShowOptions(true)
  }

  const handleStart = async (options: ProcessingOptions) => {
    setOptionsLoading(true)
    setError(null)
    try {
      let body: Record<string, unknown> = { options }

      // Get auth token
      const supabase = createSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`
      }

      if (file) {
        if (session) {
          // Real upload
          const uploadHeaders: Record<string, string> = {}
          if (session.access_token) uploadHeaders['Authorization'] = `Bearer ${session.access_token}`
          const formData = new FormData()
          formData.append('file', file)
          const uploadRes = await fetch('/api/upload', { method: 'POST', headers: uploadHeaders, body: formData })
          if (!uploadRes.ok) throw new Error('Upload failed')
          const { r2Key } = await uploadRes.json()
          body.filePath = r2Key
          body.title = file.name
        } else {
          // Dev mode - no session
          body.filePath = `dev-uploads/${file.name}`
          body.title = file.name
        }
      } else if (url) {
        body.videoUrl = url
        body.title = url
      } else {
        throw new Error('No video source')
      }

      // Show processing screen immediately before API call
      const tempJobId = `pending-${Date.now()}`
      setJobId(tempJobId)
      setShowOptions(false)
      setProcessing(true)

      const res = await fetch('/api/process', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Failed to start processing')
      const { jobId: newJobId } = await res.json()

      setJobId(newJobId)
      onJobCreated(newJobId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setOptionsLoading(false)
    }
  }

  const handleCancel = () => {
    setProcessing(false)
    setJobId(null)
    setFile(null)
    setUrl('')
    setUrlInput('')
  }

  if (processing && jobId) {
    return <ProcessingView jobId={jobId} onCancel={handleCancel} onComplete={() => {}} />
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Drag & Drop Zone */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200
          ${isDragActive ? 'border-accent bg-accent/5 drag-active' : 'border-white/10 hover:border-primary/50 hover:bg-primary/5'}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl">{isDragActive ? '📂' : '🎬'}</div>
          <div>
            <p className="text-xl font-bold text-white mb-1">
              {isDragActive ? 'Drop it!' : 'Drop your video here'}
            </p>
            <p className="text-muted text-sm">
              MP4, MOV, AVI, WebM, MKV — up to 2GB
            </p>
          </div>
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-muted text-xs uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
          <Button variant="ghost" size="md" onClick={(e) => { e.stopPropagation(); open() }}>
            Browse Files
          </Button>
        </div>
      </div>

      {/* File selected preview */}
      {file && !processing && (
        <>
          <div className="mt-4 flex items-center gap-3 p-4 bg-surface rounded-xl border border-primary/30">
            <span className="text-2xl">🎬</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{file.name}</p>
              <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <button onClick={() => { setFile(null); setShowOptions(false) }} className="text-muted hover:text-red-400 transition-colors">
              ✕
            </button>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="mt-4 w-full"
            onClick={() => setShowOptions(true)}
          >
            ⚡ Set Options &amp; Process
          </Button>
        </>
      )}

      {/* URL Input */}
      <div className="mt-6">
        <p className="text-sm font-semibold text-muted mb-3 uppercase tracking-wider">Or paste a video URL</p>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="YouTube, Twitch, or Twitter/X URL..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlPaste()}
            className="flex-1 bg-background border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted/50 focus:border-primary transition-colors"
          />
          <Button variant="ghost" onClick={handleUrlPaste} disabled={!urlInput.trim()}>
            Use URL
          </Button>
        </div>
        {url && (
          <>
            <p className="mt-2 text-xs text-primary truncate">✓ URL ready: {url}</p>
            <Button
              variant="primary"
              size="lg"
              className="mt-4 w-full"
              onClick={() => setShowOptions(true)}
            >
              ⚡ Set Options &amp; Process
            </Button>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Options Modal */}
      <OptionsModal
        isOpen={showOptions}
        onClose={() => setShowOptions(false)}
        onStart={handleStart}
        loading={optionsLoading}
      />
    </div>
  )
}
