'use client'

import React, { useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import type {
  ProcessingOptions,
  ClipLength,
  DetectionMode,
  SubtitleStyle,
  SubtitleSize,
  OutputQuality,
  PlatformFormat,
} from '@/types'

const defaultOptions: ProcessingOptions = {
  clipCount: 5,
  clipLength: '30',
  detectionMode: 'auto',
  subtitles: {
    enabled: true,
    style: 'bold',
    size: 'medium',
    color: '#ffffff',
    background: false,
  },
  outputQuality: '1080p',
  platformFormat: 'custom',
}

interface OptionsModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (options: ProcessingOptions) => void
  loading?: boolean
}

export default function OptionsModal({ isOpen, onClose, onStart, loading = false }: OptionsModalProps) {
  const [options, setOptions] = useState<ProcessingOptions>(defaultOptions)

  const update = (patch: Partial<ProcessingOptions>) => setOptions((prev) => ({ ...prev, ...patch }))
  const updateSubtitles = (patch: Partial<ProcessingOptions['subtitles']>) =>
    setOptions((prev) => ({ ...prev, subtitles: { ...prev.subtitles, ...patch } }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚙️ Clip Options" size="lg">
      <div className="space-y-6">

        {/* Clip Count */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-white">Clip Count</label>
            <span className="text-primary font-bold text-lg">{options.clipCount}</span>
          </div>
          <input
            type="range"
            min={1}
            max={20}
            value={options.clipCount}
            onChange={(e) => update({ clipCount: Number(e.target.value) })}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted mt-1">
            <span>1</span>
            <span>20</span>
          </div>
        </div>

        {/* Clip Length */}
        <div>
          <label className="block text-sm font-semibold text-white mb-2">Clip Length</label>
          <select
            value={options.clipLength}
            onChange={(e) => update({ clipLength: e.target.value as ClipLength })}
            className="w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-primary transition-colors"
          >
            <option value="15">15 seconds</option>
            <option value="30">30 seconds</option>
            <option value="45">45 seconds</option>
            <option value="60">60 seconds</option>
            <option value="90">90 seconds</option>
            <option value="custom">Custom</option>
          </select>
          {options.clipLength === 'custom' && (
            <input
              type="number"
              placeholder="Enter seconds..."
              value={options.customClipLength || ''}
              onChange={(e) => update({ customClipLength: Number(e.target.value) })}
              className="mt-2 w-full bg-background border border-white/10 rounded-xl px-4 py-2.5 text-white"
            />
          )}
        </div>

        {/* Detection Mode */}
        <div>
          <label className="block text-sm font-semibold text-white mb-3">Detection Mode</label>
          <div className="flex gap-3">
            {(['auto', 'manual'] as DetectionMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => update({ detectionMode: mode })}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all ${
                  options.detectionMode === mode
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-white/10 text-muted hover:border-white/30'
                }`}
              >
                {mode === 'auto' ? '🤖 Auto (AI)' : '✋ Manual'}
              </button>
            ))}
          </div>
        </div>

        {/* Subtitles */}
        <div className="border border-white/10 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-white">📝 Subtitles</label>
            <button
              onClick={() => updateSubtitles({ enabled: !options.subtitles.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                options.subtitles.enabled ? 'bg-primary' : 'bg-white/20'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  options.subtitles.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {options.subtitles.enabled && (
            <div className="space-y-3 pt-2">
              {/* Style */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Style</label>
                <select
                  value={options.subtitles.style}
                  onChange={(e) => updateSubtitles({ style: e.target.value as SubtitleStyle })}
                  className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="bold">Bold</option>
                  <option value="clean">Clean</option>
                  <option value="shadow">Shadow</option>
                  <option value="outline">Outline</option>
                  <option value="karaoke">Karaoke</option>
                </select>
              </div>

              {/* Size */}
              <div>
                <label className="block text-xs text-muted mb-1.5">Size</label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as SubtitleSize[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateSubtitles({ size: s })}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize ${
                        options.subtitles.size === s
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-white/10 text-muted hover:border-white/30'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color + Background */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-muted mb-1.5">Color</label>
                  <input
                    type="color"
                    value={options.subtitles.color}
                    onChange={(e) => updateSubtitles({ color: e.target.value })}
                    className="h-9 w-full rounded-lg border border-white/10 bg-background cursor-pointer"
                  />
                </div>
                <div className="flex flex-col justify-between">
                  <label className="text-xs text-muted">Background</label>
                  <button
                    onClick={() => updateSubtitles({ background: !options.subtitles.background })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      options.subtitles.background ? 'bg-primary' : 'bg-white/20'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        options.subtitles.background ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Output Quality */}
        <div>
          <label className="block text-sm font-semibold text-white mb-2">Output Quality</label>
          <div className="flex gap-3">
            {(['720p', '1080p', '4k'] as OutputQuality[]).map((q) => (
              <button
                key={q}
                onClick={() => update({ outputQuality: q })}
                className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all uppercase ${
                  options.outputQuality === q
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-white/10 text-muted hover:border-white/30'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Platform Format */}
        <div>
          <label className="block text-sm font-semibold text-white mb-2">Platform Format</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'tiktok', label: '🎵 TikTok', sub: '9:16 · max 60s' },
              { value: 'twitter', label: '🐦 Twitter/X', sub: '16:9 · max 140s' },
              { value: 'youtube_shorts', label: '▶️ YT Shorts', sub: '9:16 · max 60s' },
              { value: 'custom', label: '⚙️ Custom', sub: 'Original ratio' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => update({ platformFormat: p.value as PlatformFormat })}
                className={`py-3 px-4 rounded-xl border transition-all text-left ${
                  options.platformFormat === p.value
                    ? 'border-primary bg-primary/10'
                    : 'border-white/10 hover:border-white/30'
                }`}
              >
                <div className="text-sm font-semibold text-white">{p.label}</div>
                <div className="text-xs text-muted">{p.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={loading}
            onClick={() => onStart(options)}
          >
            🚀 Start Processing
          </Button>
        </div>
      </div>
    </Modal>
  )
}
