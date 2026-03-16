import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import os from 'os'
import fs from 'fs'

export interface ClipSegment {
  startTime: number
  endTime: number
  outputPath: string
}

export async function extractClip(
  inputPath: string,
  startTime: number,
  duration: number,
  outputPath: string,
  options: {
    quality?: '720p' | '1080p' | '4k'
    format?: 'tiktok' | 'twitter' | 'youtube_shorts' | 'custom'
  } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { quality = '720p', format = 'custom' } = options

    const scaleMap: Record<string, string> = {
      '720p': '1280:720',
      '1080p': '1920:1080',
      '4k': '3840:2160',
    }

    const aspectMap: Record<string, string> = {
      tiktok: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
      youtube_shorts: 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
      twitter: `scale=${scaleMap[quality]}:force_original_aspect_ratio=decrease,pad=${scaleMap[quality]}:(ow-iw)/2:(oh-ih)/2`,
      custom: `scale=${scaleMap[quality]}:force_original_aspect_ratio=decrease`,
    }

    const vf = aspectMap[format] || aspectMap.custom

    ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(duration)
      .videoFilter(vf)
      .audioCodec('aac')
      .videoCodec('libx264')
      .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
}

export async function extractThumbnail(
  inputPath: string,
  timeOffset: number,
  outputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(timeOffset)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
}

export async function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) reject(err)
      else resolve(metadata.format.duration || 0)
    })
  })
}

export async function burnSubtitles(
  inputPath: string,
  srtPath: string,
  outputPath: string,
  style: {
    fontsize?: number
    fontcolor?: string
    outline?: number
    shadow?: number
    bold?: boolean
    background?: boolean
  } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { fontsize = 24, fontcolor = 'white', outline = 2, shadow = 0, bold = false, background = false } = style

    let subtitleFilter = `subtitles='${srtPath}':force_style='FontSize=${fontsize},PrimaryColour=&H${hexToAss(fontcolor)},OutlineColour=&H00000000,Outline=${outline},Shadow=${shadow},Bold=${bold ? 1 : 0}'`

    if (background) {
      subtitleFilter = `subtitles='${srtPath}':force_style='FontSize=${fontsize},PrimaryColour=&H${hexToAss(fontcolor)},BackColour=&H80000000,BorderStyle=4,Outline=0,Shadow=0,Bold=${bold ? 1 : 0}'`
    }

    ffmpeg(inputPath)
      .videoFilter(subtitleFilter)
      .audioCodec('copy')
      .videoCodec('libx264')
      .outputOptions(['-preset fast', '-crf 23'])
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run()
  })
}

function hexToAss(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length === 6) {
    const r = clean.substring(0, 2)
    const g = clean.substring(2, 4)
    const b = clean.substring(4, 6)
    return `00${b}${g}${r}`.toUpperCase()
  }
  return '00FFFFFF'
}

export function generateSRT(cues: { start: number; end: number; text: string }[]): string {
  return cues
    .map((cue, i) => {
      const start = formatSRTTime(cue.start)
      const end = formatSRTTime(cue.end)
      return `${i + 1}\n${start} --> ${end}\n${cue.text}\n`
    })
    .join('\n')
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 1000)
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

export function getTempDir(): string {
  const dir = path.join(os.tmpdir(), 'slicer')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
