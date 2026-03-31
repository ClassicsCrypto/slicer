'use client'

import { useState, useEffect } from 'react'

interface UsageData {
  assemblyai: { used: number; limit: number; unit: string }
  groq: { used: number; limit: number; unit: string }
  supabase: { used: number; limit: number; unit: string }
  stats: {
    totalJobs: number
    totalClips: number
    totalHoursProcessed: number
    avgClipsPerJob: number
    exportsCount: number
  }
  recentJobs: Array<{
    id: string
    title: string
    status: string
    duration: number
    clipCount: number
    created_at: string
  }>
}

function UsageBar({ label, icon, used, limit, unit, color }: {
  label: string; icon: string; used: number; limit: number; unit: string; color: string
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  const isWarning = pct > 80
  const isCritical = pct > 95

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white flex items-center gap-2">
          <span className="text-lg">{icon}</span> {label}
        </span>
        <span className={`text-xs font-mono ${isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-white/50'}`}>
          {used.toFixed(1)} / {limit} {unit}
        </span>
      </div>
      <div className="h-3 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: isCritical
              ? 'linear-gradient(90deg, #FF4D4D, #FF2020)'
              : isWarning
              ? 'linear-gradient(90deg, #FFB020, #FF8800)'
              : `linear-gradient(90deg, ${color}, ${color}88)`,
          }}
        />
      </div>
      <div className="text-right">
        <span className={`text-[10px] ${isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-white/30'}`}>
          {pct.toFixed(0)}% used
        </span>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl p-4 border border-white/5" style={{ background: '#15151F' }}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xl font-black text-white">{value}</div>
      <div className="text-xs text-white/40">{label}</div>
    </div>
  )
}

export default function UsageTab() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUsage()
  }, [])

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/usage')
      if (res.ok) {
        setData(await res.json())
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-red-500 rounded-full animate-spin mx-auto" />
        <p className="text-white/30 text-sm mt-4">Loading usage data...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <p className="text-white/30 text-sm">Failed to load usage data.</p>
        <button onClick={fetchUsage} className="text-red-400 text-sm mt-2 hover:underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      {/* API Usage */}
      <div className="rounded-2xl p-6 border border-white/5" style={{ background: '#15151F' }}>
        <h2 className="text-lg font-bold text-white mb-1">API Usage</h2>
        <p className="text-xs text-white/30 mb-6">Monthly usage across services (free tier limits)</p>

        <div className="space-y-5">
          <UsageBar
            label="AssemblyAI" icon="🎙️"
            used={data.assemblyai.used} limit={data.assemblyai.limit} unit={data.assemblyai.unit}
            color="#6C5CE7"
          />
          <UsageBar
            label="Groq LLM" icon="🧠"
            used={data.groq.used} limit={data.groq.limit} unit={data.groq.unit}
            color="#00B894"
          />
          <UsageBar
            label="Supabase Storage" icon="💾"
            used={data.supabase.used} limit={data.supabase.limit} unit={data.supabase.unit}
            color="#FF6B6B"
          />
        </div>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon="📹" label="Videos Processed" value={String(data.stats.totalJobs)} />
          <StatCard icon="⏱️" label="Hours Transcribed" value={data.stats.totalHoursProcessed.toFixed(1)} />
          <StatCard icon="✂️" label="Clips Generated" value={String(data.stats.totalClips)} />
          <StatCard icon="📊" label="Avg Clips / Video" value={data.stats.avgClipsPerJob.toFixed(1)} />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl p-6 border border-white/5" style={{ background: '#15151F' }}>
        <h2 className="text-lg font-bold text-white mb-4">Recent Activity</h2>
        {data.recentJobs.length === 0 ? (
          <p className="text-white/30 text-sm">No jobs yet.</p>
        ) : (
          <div className="space-y-2">
            {data.recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    job.status === 'complete' ? 'bg-green-400' : job.status === 'processing' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
                  }`} />
                  <span className="text-sm text-white truncate">{job.title}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/40 flex-shrink-0">
                  <span>{job.clipCount} clips</span>
                  <span>{new Date(job.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
