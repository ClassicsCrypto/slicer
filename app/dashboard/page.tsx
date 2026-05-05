'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Job } from '@/types'
import UploadTab from '@/components/dashboard/UploadTab'
import ClipsGallery from '@/components/dashboard/ClipsGallery'
import AutoClipTab from '@/components/dashboard/AutoClipTab'
import DeveloperTab from '@/components/dashboard/DeveloperTab'
import AccountMenu from '@/components/auth/AccountMenu'

type Tab = 'upload' | 'clips' | 'autoclip' | 'developer'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('upload')
  const [galleryKey, setGalleryKey] = useState(0)
  const [processingJobs, setProcessingJobs] = useState<Job[]>([])

  const handleJobCreated = useCallback((job: Job) => {
    setProcessingJobs((prev) => [job, ...prev.filter((existing) => existing.id !== job.id)])
    setGalleryKey((k) => k + 1)
  }, [])

  const openClipsTab = useCallback(() => {
    setActiveTab('clips')
    setGalleryKey((k) => k + 1)
  }, [])

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'clips') {
      setGalleryKey((k) => k + 1)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0F' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(10,10,15,0.82), rgba(21,21,31,0.58))' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/mcv-logo-official.png"
              alt="Slicer"
              width={36}
              height={36}
              className="object-contain drop-shadow-[0_0_8px_rgba(255,77,77,0.5)]"
            />
            <span className="font-black text-xl text-gradient-red tracking-tight">SLICER</span>
            <span className="text-white/20 text-sm ml-1">by MCV</span>
          </div>

          {/* Tab nav */}
          <nav className="flex items-center gap-1">
            {([
              { key: 'upload', label: '📤 Upload', },
              { key: 'clips', label: '🎬 Clips' },
              { key: 'autoclip', label: '🤖 Auto-Clip' },
              { key: 'developer', label: '🔌 API' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === tab.key
                    ? 'liquid-button text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
                style={activeTab === tab.key ? { background: 'linear-gradient(135deg, #FF4D4D22, #FF6B6B11)', borderBottom: '2px solid #FF4D4D' } : {}}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <AccountMenu />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6">
        {activeTab === 'upload' && (
          <UploadTab onJobCreated={handleJobCreated} onViewClips={openClipsTab} />
        )}

        {activeTab === 'clips' && (
          <ClipsGallery key={galleryKey} initialJobs={processingJobs} />
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
