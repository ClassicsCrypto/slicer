'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'

type CaptionPreset = 'mcv' | 'gaming' | 'clean' | 'meme'
type CaptionPosition = 'top' | 'center' | 'bottom'
type CaptionMotion = 'none' | 'pop' | 'fade'
type CaptionCase = 'original' | 'upper'
type ExportFormat = 'twitter' | 'tiktok' | 'square' | 'original'
type PanelKey = 'subtitle' | 'layout' | 'export'

const PRESETS: Record<CaptionPreset, { label: string; font: string; color: string; highlight: string; outline: string; caption: string }> = {
  mcv: {
    label: 'MCV Branded',
    font: 'Sora',
    color: '#ffffff',
    highlight: '#ff4d4d',
    outline: 'Thick',
    caption: 'Mars Cats never miss the clip',
  },
  gaming: {
    label: 'Gaming Pop',
    font: 'Impact',
    color: '#ffffff',
    highlight: '#ffeb3b',
    outline: 'Thick',
    caption: 'That was actually insane',
  },
  clean: {
    label: 'Clean TikTok',
    font: 'Montserrat',
    color: '#ffffff',
    highlight: '#ffffff',
    outline: 'Medium',
    caption: 'This is the moment people replay',
  },
  meme: {
    label: 'Meme Bold',
    font: 'Impact',
    color: '#ffffff',
    highlight: '#00e5ff',
    outline: 'Thick',
    caption: 'Bro had one job',
  },
}

const FORMAT_LABELS: Record<ExportFormat, string> = {
  twitter: '16:9',
  tiktok: '9:16',
  square: '1:1',
  original: 'Original',
}

function panelButtonClass(active: boolean) {
  return `rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-all ${
    active
      ? 'border-red-500/35 bg-red-500/12 text-white shadow-[0_0_24px_rgba(255,77,77,0.10)]'
      : 'border-white/10 bg-black/20 text-white/55 hover:border-white/20 hover:text-white'
  }`
}

function selectClass() {
  return 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-semibold text-white focus:border-red-500 focus:outline-none'
}

export default function JobCardOptionTwoMockup() {
  const [openPanel, setOpenPanel] = useState<PanelKey>('subtitle')
  const [preset, setPreset] = useState<CaptionPreset>('mcv')
  const [position, setPosition] = useState<CaptionPosition>('bottom')
  const [motion, setMotion] = useState<CaptionMotion>('pop')
  const [textCase, setTextCase] = useState<CaptionCase>('original')
  const [format, setFormat] = useState<ExportFormat>('tiktok')
  const [clipLength, setClipLength] = useState(32)
  const [safeZone, setSafeZone] = useState(18)
  const [watermark, setWatermark] = useState(true)

  const presetDetails = PRESETS[preset]
  const captionWords = useMemo(() => {
    const text = textCase === 'upper' ? presetDetails.caption.toUpperCase() : presetDetails.caption
    const words = text.split(' ')
    return words.map((word, index) => ({ word, active: index === 2 || index === 3 }))
  }, [presetDetails.caption, textCase])

  const previewShape = format === 'tiktok'
    ? 'mx-auto aspect-[9/16] h-[min(65vh,640px)] max-h-[640px] w-auto'
    : format === 'square'
      ? 'mx-auto aspect-square h-[min(58vh,560px)] max-h-[560px] w-auto'
      : 'aspect-video w-full'

  const captionPositionClass = position === 'top'
    ? 'top-[14%]'
    : position === 'center'
      ? 'top-1/2 -translate-y-1/2'
      : 'bottom-[18%]'

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      <header
        className="fixed left-0 right-0 top-0 z-50 border-b border-white/10 backdrop-blur-2xl"
        style={{ background: 'linear-gradient(135deg, rgba(10,10,15,0.94), rgba(21,21,31,0.80))' }}
      >
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/mcv-logo-official.png"
              alt="Slicer"
              width={36}
              height={36}
              className="object-contain drop-shadow-[0_0_8px_rgba(255,77,77,0.5)]"
            />
            <span className="text-xl font-black tracking-tight text-gradient-red">SLICER</span>
            <span className="hidden text-sm text-white/20 sm:inline">job workspace mock-up</span>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {(['Ready', '32s', FORMAT_LABELS[format], PRESETS[preset].label] as const).map((item) => (
              <span key={item} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/45">
                {item}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] gap-4 px-4 pb-5 pt-[88px] sm:px-6 lg:h-screen lg:grid-cols-[260px_minmax(0,1fr)_340px] lg:overflow-hidden">
        <aside className="space-y-3 lg:overflow-y-auto lg:pb-4">
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-red-300">Current Job</p>
            <h1 className="text-xl font-black leading-tight tracking-tight text-white">Slicer III refinement sample</h1>
            <p className="mt-2 text-xs leading-5 text-white/35">Requested 5 clips. Delivered 5. Clip 03 selected.</p>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="space-y-2">
              {[
                { id: 'subtitle' as const, label: 'Subtitle Studio', meta: PRESETS[preset].label },
                { id: 'layout' as const, label: 'Clip Layout', meta: FORMAT_LABELS[format] },
                { id: 'export' as const, label: 'Export Queue', meta: watermark ? 'Watermark on' : 'Clean' },
              ].map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setOpenPanel(panel.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-all ${
                    openPanel === panel.id
                      ? 'border-red-500/35 bg-red-500/12'
                      : 'border-white/10 bg-black/20 hover:border-white/20'
                  }`}
                >
                  <span className="block text-sm font-bold text-white">{panel.label}</span>
                  <span className="mt-0.5 block text-xs text-white/35">{panel.meta}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/35">Clips</span>
              <span className="text-xs text-white/25">5 total</span>
            </div>
            <div className="space-y-2">
              {['Opening laugh', 'Clean setup', 'Best reaction', 'Clutch save', 'Outro beat'].map((clip, index) => (
                <button
                  key={clip}
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                    index === 2
                      ? 'border-red-500/30 bg-red-500/10 text-white'
                      : 'border-white/10 bg-black/20 text-white/45 hover:text-white'
                  }`}
                >
                  <span className="font-semibold">Clip {index + 1}</span>
                  <span className="ml-2 text-xs text-white/30">{clip}</span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-col gap-4 lg:min-h-0">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 lg:min-h-0 lg:flex-1">
            <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-black/35">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">Live Preview</p>
                  <h2 className="text-lg font-black text-white">Clip 03 - Best reaction</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/60 hover:text-white">Retry Score</button>
                  <button className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #FF4D4D, #FF6B6B)' }}>Export Clip</button>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center bg-black p-4 lg:min-h-0">
                <div className={`${previewShape} relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_24px_80px_rgba(0,0,0,0.55)]`}>
                  <video
                    src="/slicer-cat.mp4"
                    className="h-full w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),transparent_30%,rgba(0,0,0,0.25))]" />
                  {watermark && (
                    <Image
                      src="/slicer-watermark-white.png"
                      alt="Slicer watermark"
                      width={180}
                      height={180}
                      className="absolute right-4 top-4 h-14 w-14 object-contain opacity-55 drop-shadow-[0_0_14px_rgba(255,77,77,0.22)]"
                    />
                  )}
                  <div className={`absolute left-0 right-0 flex justify-center px-4 ${captionPositionClass}`}>
                    <div
                      className={`max-w-[90%] text-center text-2xl font-black leading-tight md:text-3xl ${motion === 'pop' ? 'scale-105' : ''} ${motion === 'fade' ? 'opacity-85' : ''}`}
                      style={{
                        fontFamily: `${presetDetails.font}, Impact, Arial Black, sans-serif`,
                        textShadow: presetDetails.outline === 'Thick'
                          ? '3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000, 0 4px 10px rgba(0,0,0,0.75)'
                          : '2px 2px 0 #000, 0 3px 8px rgba(0,0,0,0.65)',
                      }}
                    >
                      {captionWords.map(({ word, active }) => (
                        <span key={word} style={{ color: active ? presetDetails.highlight : presetDetails.color }}>
                          {word}{' '}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 px-4 py-3">
                <div className="mb-2 flex items-center justify-between text-xs text-white/35">
                  <span>0:08</span>
                  <span>{clipLength}s clip</span>
                  <span>0:{clipLength.toString().padStart(2, '0')}</span>
                </div>
                <div className="relative h-8">
                  <div className="absolute left-0 right-0 top-3 h-2 rounded-full bg-white/10" />
                  <div className="absolute left-[18%] right-[12%] top-3 h-2 rounded-full bg-white/15" />
                  <div className="absolute left-[18%] top-3 h-2 w-[35%] rounded-full" style={{ background: 'linear-gradient(90deg, #FF4D4D, #FF6B6B)' }} />
                  <div className="absolute left-[18%] top-0 h-8 w-3 rounded-sm bg-white/70" />
                  <div className="absolute right-[12%] top-0 h-8 w-3 rounded-sm bg-white/70" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4 lg:overflow-y-auto lg:pb-4">
          {openPanel === 'subtitle' && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Subtitle Studio</p>
                <h3 className="mt-1 text-xl font-black text-white">Caption controls</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Preset</label>
                  <select value={preset} onChange={(event) => setPreset(event.target.value as CaptionPreset)} className={selectClass()}>
                    {Object.entries(PRESETS).map(([key, value]) => (
                      <option key={key} value={key}>{value.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Position</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['top', 'center', 'bottom'] as CaptionPosition[]).map((item) => (
                      <button key={item} type="button" onClick={() => setPosition(item)} className={panelButtonClass(position === item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Motion</label>
                  <select value={motion} onChange={(event) => setMotion(event.target.value as CaptionMotion)} className={selectClass()}>
                    <option value="pop">Pop</option>
                    <option value="fade">Fade</option>
                    <option value="none">None</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-white/35">Text Case</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['original', 'upper'] as CaptionCase[]).map((item) => (
                      <button key={item} type="button" onClick={() => setTextCase(item)} className={panelButtonClass(textCase === item)}>
                        {item === 'upper' ? 'UPPER' : 'Original'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-[0.16em] text-white/35">Safe Zone</span>
                    <span className="font-semibold text-white">{safeZone}%</span>
                  </div>
                  <input type="range" min="8" max="30" value={safeZone} onChange={(event) => setSafeZone(Number(event.target.value))} className="w-full accent-red-500" />
                </div>
              </div>
            </section>
          )}

          {openPanel === 'layout' && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Clip Layout</p>
                <h3 className="mt-1 text-xl font-black text-white">Canvas and trim</h3>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(['twitter', 'tiktok', 'square', 'original'] as ExportFormat[]).map((item) => (
                    <button key={item} type="button" onClick={() => setFormat(item)} className={panelButtonClass(format === item)}>
                      <span className="block">{FORMAT_LABELS[item]}</span>
                      <span className="mt-0.5 block text-[11px] text-white/30">{item}</span>
                    </button>
                  ))}
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-bold uppercase tracking-[0.16em] text-white/35">Clip Length</span>
                    <span className="font-semibold text-white">{clipLength}s</span>
                  </div>
                  <input type="range" min="15" max="60" value={clipLength} onChange={(event) => setClipLength(Number(event.target.value))} className="w-full accent-red-500" />
                </div>
              </div>
            </section>
          )}

          {openPanel === 'export' && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">Export Queue</p>
                <h3 className="mt-1 text-xl font-black text-white">Final settings</h3>
              </div>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setWatermark((current) => !current)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition-all ${watermark ? 'border-red-500/35 bg-red-500/12 text-white' : 'border-white/10 bg-black/20 text-white/55'}`}
                >
                  <span className="block text-sm font-bold">Slicer watermark</span>
                  <span className="mt-0.5 block text-xs text-white/35">{watermark ? 'Enabled' : 'Disabled'}</span>
                </button>
                {['X draft', 'TikTok/Reels render', 'YouTube Shorts render'].map((item) => (
                  <div key={item} className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-white/75">{item}</span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/35">queued</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">One-page goal</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ['Preview', 'always on'],
                ['Menus', 'dynamic'],
                ['Changes', 'instant'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-white/10 bg-black/20 px-2 py-3">
                  <div className="text-xs font-bold text-white">{label}</div>
                  <div className="mt-1 text-[11px] text-white/35">{value}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}
