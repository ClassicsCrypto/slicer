'use client'

import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'

type ApiKeyRecord = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export default function DeveloperTab() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [name, setName] = useState('Slicer API Key')
  const [newKey, setNewKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadKeys = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/developer/keys')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load API keys')
      setKeys(data.keys || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadKeys() }, [])

  const createKey = async () => {
    setSaving(true)
    setError(null)
    setNewKey(null)
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes: ['jobs:read', 'clips:read', 'clips:export'] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create API key')
      setNewKey(data.key)
      await loadKeys()
    } catch (err: any) {
      setError(err?.message || 'Failed to create API key')
    } finally {
      setSaving(false)
    }
  }

  const revokeKey = async (id: string) => {
    if (!confirm('Revoke this API key? Existing tools using it will stop working.')) return
    setError(null)
    try {
      const res = await fetch(`/api/developer/keys/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to revoke API key')
      await loadKeys()
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke API key')
    }
  }

  return (
    <div className="py-8 md:py-10 space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
        <p className="text-red-400 text-sm font-bold mb-2">DEVELOPER API</p>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">Let agents pull Slicer media.</h1>
        <p className="max-w-3xl text-white/50 leading-7">
          API v1 starts read-only: jobs, clips, subtitles, proof frames, and source metadata. Keys are scoped to this workspace and can be revoked anytime.
        </p>
      </section>

      <section className="grid lg:grid-cols-[0.85fr_1.15fr] gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Create API key</h2>
            <p className="text-sm text-white/35">The full key is shown once. Store it somewhere safe.</p>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-white/70 mb-2 block">Key name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-red-500 focus:outline-none"
            />
          </label>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/45">
            Scopes: <span className="text-white/70">jobs:read</span>, <span className="text-white/70">clips:read</span>, <span className="text-white/70">clips:export</span>
          </div>
          <Button onClick={createKey} disabled={saving}>{saving ? 'Creating…' : 'Create Key'}</Button>
          {newKey && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-3">
              <div className="mb-2 text-sm font-semibold text-green-100">Copy this key now:</div>
              <code className="block overflow-auto rounded bg-black/40 p-2 text-xs text-green-100">{newKey}</code>
            </div>
          )}
          {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100/80">{error}</div>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">API keys</h2>
              <p className="text-sm text-white/35">Active and revoked workspace keys.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadKeys}>Refresh</Button>
          </div>
          {loading ? (
            <div className="text-white/40 text-sm">Loading…</div>
          ) : keys.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-white/35 text-sm">No API keys yet.</div>
          ) : (
            <div className="space-y-3">
              {keys.map((key) => (
                <div key={key.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-bold">{key.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${key.revokedAt ? 'border-white/10 text-white/35 bg-white/5' : 'border-green-500/30 text-green-300 bg-green-500/10'}`}>{key.revokedAt ? 'revoked' : 'active'}</span>
                      </div>
                      <div className="text-xs text-white/30 space-y-1">
                        <div>{key.keyPrefix}</div>
                        <div>Scopes: {key.scopes.join(', ')}</div>
                        <div>Created: {new Date(key.createdAt).toLocaleString()}</div>
                        <div>Last used: {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</div>
                      </div>
                    </div>
                    {!key.revokedAt && <Button variant="danger" size="sm" onClick={() => revokeKey(key.id)}>Revoke</Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-4">
        <h2 className="text-xl font-bold text-white">API v1 quick start</h2>
        <pre className="overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-5 text-white/60">{`curl -H "Authorization: Bearer $SLICER_API_KEY" \\
  https://deputy-stats-implies-beaches.trycloudflare.com/api/v1/jobs

curl -H "Authorization: Bearer $SLICER_API_KEY" \\
  https://deputy-stats-implies-beaches.trycloudflare.com/api/v1/clips

curl -L -H "Authorization: Bearer $SLICER_API_KEY" \\
  "https://deputy-stats-implies-beaches.trycloudflare.com/api/v1/clips/<clip_id>/download?format=tiktok" \\
  -o slicer-clip.mp4

curl -H "Authorization: Bearer $SLICER_API_KEY" \\
  https://deputy-stats-implies-beaches.trycloudflare.com/api/v1/jobs/<job_id>

curl -H "Authorization: Bearer $SLICER_API_KEY" \\
  https://deputy-stats-implies-beaches.trycloudflare.com/api/v1/jobs/<job_id>/manifest`}</pre>
      </section>
    </div>
  )
}
