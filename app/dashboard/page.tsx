'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Job } from '@/types'
import UploadTab from '@/components/dashboard/UploadTab'
import ClipsGallery from '@/components/dashboard/ClipsGallery'
import AutoClipTab from '@/components/dashboard/AutoClipTab'
import DeveloperTab from '@/components/dashboard/DeveloperTab'
import JobStudioTab from '@/components/dashboard/JobStudioTab'
import AccountMenu from '@/components/auth/AccountMenu'

type Tab = 'upload' | 'clips' | 'studio' | 'autoclip' | 'developer'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('clips')
  const [galleryKey, setGalleryKey] = useState(0)
  const [processingJobs, setProcessingJobs] = useState<Job[]>([])
  const [selectedStudioJob, setSelectedStudioJob] = useState<Job | null>(null)
  const [selectedStudioClipId, setSelectedStudioClipId] = useState<string | undefined>()

  const handleJobCreated = useCallback((job: Job) => {
    setProcessingJobs((prev) => [job, ...prev.filter((existing) => existing.id !== job.id)])
    setGalleryKey((k) => k + 1)
  }, [])

  const openClipsTab = useCallback(() => {
    setActiveTab('clips')
    setGalleryKey((k) => k + 1)
  }, [])

  const openJobStudio = useCallback((job: Job, clipId?: string) => {
    setSelectedStudioJob(job)
    setSelectedStudioClipId(clipId)
    setActiveTab('studio')
  }, [])

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab !== 'studio') {
      setSelectedStudioClipId(undefined)
    }
    if (tab === 'clips') {
      setGalleryKey((k) => k + 1)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(ellipse at 50% -20%, rgba(255,90,54,0.06), transparent 50%), #0A0911' }}>
      {/* Header */}
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 backdrop-blur-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(10,9,17,0.92), rgba(22,18,29,0.78))' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <Image
              src="/mcv-logo-official.png"
              alt="Slicer"
              width={36}
              height={36}
              className="self-center object-contain drop-shadow-[0_0_8px_rgba(255,90,54,0.5)]"
            />
            <span className="font-display text-2xl font-bold uppercase tracking-wide text-gradient-red">Slicer</span>
            <span className="eyebrow hidden sm:inline">MCV Edit Bay</span>
          </div>

          {/* Tab nav */}
          <nav className="flex items-center gap-1">
            {([
              { key: 'upload', label: 'Upload' },
              { key: 'clips', label: 'Streams' },
              { key: 'studio', label: 'Job Studio' },
              { key: 'autoclip', label: 'Auto-Clip' },
              { key: 'developer', label: 'API' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`relative px-3 sm:px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-[0.16em] transition-all ${
                  activeTab === tab.key
                    ? 'text-dust bg-white/[0.06]'
                    : 'text-dust/40 hover:text-dust/75'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--mars)] shadow-[0_0_8px_rgba(255,90,54,0.8)]" />
                )}
              </button>
            ))}
          </nav>

          <AccountMenu />
        </div>
      </header>

      {/* Content */}
      <main className={`${activeTab === 'studio' ? 'max-w-[1800px]' : 'max-w-7xl'} mx-auto px-4 pt-[76px] sm:px-6`}>
        {activeTab === 'upload' && (
          <UploadTab onJobCreated={handleJobCreated} onViewClips={openClipsTab} />
        )}

        {activeTab === 'clips' && (
          <ClipsGallery key={galleryKey} initialJobs={processingJobs} onEditJob={openJobStudio} />
        )}

        {activeTab === 'studio' && (
          <JobStudioTab
            selectedJobId={selectedStudioJob?.id}
            selectedClipId={selectedStudioClipId}
            initialJob={selectedStudioJob ?? undefined}
            onBackToStreams={() => handleTabChange('clips')}
          />
        )}

        {activeTab === 'autoclip' && (
          <AutoClipTab />
        )}

        {activeTab === 'developer' && (
          <DeveloperTab />
        )}

      </main>
    </div>
  )
}
