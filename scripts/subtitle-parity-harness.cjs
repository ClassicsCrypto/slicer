const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'tmp', 'subtitle-parity');
fs.mkdirSync(OUT, { recursive: true });

const db = new Database(path.join(ROOT, 'server/data/slicer.sqlite'), { readonly: true });
const jobRow = db.prepare(`select * from jobs where status='complete' and deleted_at is null order by datetime(created_at) desc limit 1`).get();
if (!jobRow) throw new Error('No complete job found');
const job = { ...jobRow, options: JSON.parse(jobRow.options_json || '{}'), progress: JSON.parse(jobRow.progress_json || '{}') };
const clip = job.progress.completedClips?.[0];
if (!clip) throw new Error('Latest job has no completed clips');
const sourcePath = job.source_path;
if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error(`Missing source path: ${sourcePath}`);

const { DEFAULT_SUBTITLE_OPTIONS } = require('../lib/subtitle-core.js');
const baseOptions = {
  ...DEFAULT_SUBTITLE_OPTIONS,
  ...(job.options?.subtitles || {}),
  // Deliberate harness overrides: deterministic frames, no watermark noise.
  animationPreset: 'none',
  watermarkEnabled: false,
};

const cases = [
  ['baseline-active-pill', {}],
  ['mode-phrase', { mode: 'phrase' }],
  ['mode-word-pop', { mode: 'word_pop' }],
  ['mode-karaoke', { mode: 'karaoke' }],
  ['bg-solid-blue-70', { background: 'solid', backgroundColor: '#1438ff', backgroundOpacity: 70 }],
  ['bg-rounded-red-55', { background: 'rounded_box', backgroundColor: '#ff0033', backgroundOpacity: 55 }],
  ['bg-active-word-pill', { background: 'active_word_pill', backgroundColor: '#00ff7f', backgroundOpacity: 65 }],
  ['color-custom-outline', { color: 'custom', customColor: '#00e5ff', outlineColor: 'custom', customOutlineColor: '#ff00ff', outlineThickness: 'thick' }],
  ['size-small', { size: 'small' }],
  ['size-large', { size: 'large' }],
  ['safe-top', { safeZone: 'upper_safe', position: 'top' }],
  ['safe-center', { safeZone: 'center_safe', position: 'center' }],
  ['font-comic', { font: 'comic_sans' }],
  ['font-georgia', { font: 'georgia' }],
  ['textcase-upper', { textCase: 'upper' }],
  ['shadow-off-outline-none', { shadow: false, outlineThickness: 'none' }],
  ['active-underline', { mode: 'active_word', activeWordStyle: 'underline' }],
  ['active-scale', { mode: 'active_word', activeWordStyle: 'scale' }],
  ['active-color', { mode: 'active_word', activeWordStyle: 'color' }],
];

// Shared implementations — the whole point of a PARITY harness is to render
// with the exact functions the app uses. (The old local normalizeWords lacked
// the Math.max(0,...) clamp and the end>start filter: drift, now gone.)
const {
  normalizeSubtitleWords: normalizeWords,
  groupSubtitleWords: groupWords,
} = require('../lib/subtitle-core.js');
function applyCase(text, textCase) {
  if (textCase === 'upper') return text.toUpperCase();
  if (textCase === 'title') return text.replace(/\b\w/g, c => c.toUpperCase());
  return text;
}
function hexToRgba(hex = '#000000', opacityPercent = 45) {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map(c => c+c).join('') : n.padEnd(6,'0').slice(0,6);
  return `rgba(${parseInt(full.slice(0,2),16)}, ${parseInt(full.slice(2,4),16)}, ${parseInt(full.slice(4,6),16)}, ${Math.max(0, Math.min(100, opacityPercent))/100})`;
}
function currentCueAt(words, t) {
  const cues = groupWords(words);
  for (let i = cues.length - 1; i >= 0; i--) {
    const cue = cues[i];
    if (t >= cue[0].start - 0.08 && t <= cue[cue.length-1].end + 0.55) return cue;
  }
  return cues[0];
}
function currentWordIndex(cue, t) {
  return cue.findIndex((w, i) => {
    const next = cue[i+1];
    const wordEnd = next ? Math.max(w.end, next.start - 0.02) : w.end + 0.18;
    return t >= w.start && t <= wordEnd;
  });
}
function previewHtml({ options, imagePath, time }) {
  const words = normalizeWords(clip.subtitles || []);
  const cue = currentCueAt(words, time);
  const idx = Math.max(0, currentWordIndex(cue, time));
  const sizeClass = options.mode === 'word_pop'
    ? (options.size === 'small' ? '20px' : options.size === 'large' ? '36px' : '30px')
    : (options.size === 'small' ? '16px' : options.size === 'large' ? '24px' : '18px');
  const fontMap = { impact:'Impact, Arial Black, sans-serif', bebas:'Bebas Neue, Impact, sans-serif', montserrat:'Montserrat, Arial, sans-serif', sora:'Sora, Montserrat, sans-serif', arial_black:'Arial Black, Arial, sans-serif', trebuchet:'Trebuchet MS, sans-serif', verdana:'Verdana, Geneva, sans-serif', georgia:'Georgia, serif', times_new_roman:'Times New Roman, serif', comic_sans:'Comic Sans MS, Comic Sans, cursive', cooper_black:'Cooper Black, Impact, serif', arial_rounded:'Arial Rounded MT Bold, Arial, sans-serif', lucida_handwriting:'Lucida Handwriting, Brush Script MT, cursive', brush_script:'Brush Script MT, Lucida Handwriting, cursive', papyrus:'Papyrus, fantasy' };
  const textColor = options.color && options.color !== 'custom' ? options.color : (options.customColor || '#ffffff');
  const outlineColor = options.outlineColor && options.outlineColor !== 'custom' ? options.outlineColor : (options.customOutlineColor || '#000000');
  const bgColor = options.backgroundColor && options.backgroundColor !== 'custom' ? options.backgroundColor : (options.customBackgroundColor || '#000000');
  const bg = hexToRgba(bgColor, options.backgroundOpacity ?? 45);
  const px = (options.outlineThickness || 'medium') === 'none' ? 0 : (options.outlineThickness || 'medium') === 'thin' ? 1 : (options.outlineThickness || 'medium') === 'thick' ? 3 : 2;
  const shadows = [];
  if (px > 0) shadows.push(`${-px}px ${-px}px 0 ${outlineColor}`, `${px}px ${-px}px 0 ${outlineColor}`, `${-px}px ${px}px 0 ${outlineColor}`, `${px}px ${px}px 0 ${outlineColor}`, `${-px-1}px 0 0 ${outlineColor}`, `${px+1}px 0 0 ${outlineColor}`, `0 ${-px-1}px 0 ${outlineColor}`, `0 ${px+1}px 0 ${outlineColor}`);
  if (options.shadow) shadows.push('2px 2px 4px rgba(0,0,0,0.7)');
  const shadow = shadows.join(', ');
  const top = (options.safeZone === 'upper_safe' || options.position === 'top') ? 'top:12%;' : (options.safeZone === 'center_safe' || options.position === 'center') ? 'top:50%; transform:translateY(-50%);' : 'bottom:18%;';
  const cueBg = (options.background === 'solid' || options.background === 'rounded_box') ? `background:${bg}; border-radius:${options.background === 'solid' ? '0.35em' : '0.72em'}; padding:0.22em 0.5em;` : '';
  const wordPill = options.background === 'active_word_pill' ? `background:${bg}; border-radius:0.8em; padding:0.16em 0.52em;` : '';
  const mode = options.mode || 'phrase';
  const transform = options.animationPreset && options.animationPreset !== 'none' ? 'scale(1.22) translateY(-3px)' : 'scale(1)';
  let inner = '';
  if (mode === 'word_pop') {
    const w = cue[idx] || cue[0];
    inner = `<p style="margin:0;font-size:${sizeClass};font-weight:800;letter-spacing:.045em;color:${textColor};${options.background === 'active_word_pill' ? wordPill : ''};text-shadow:${shadow};text-transform:${options.textCase === 'upper' ? 'uppercase' : options.textCase === 'title' ? 'capitalize' : 'none'};transform:${transform};line-height:1.1;">${applyCase(w.text, options.textCase)}</p>`;
  } else {
    inner = cue.map((w, i) => {
      const active = i === idx;
      let color = textColor;
      let bgStyle = wordPill;
      let extra = '';
      if (mode === 'active_word') {
        color = active ? (options.highlightColor || '#ffeb3b') : textColor;
        if (!bgStyle && active && (options.activeWordStyle || 'pill') === 'pill') bgStyle = 'background:rgba(255,235,59,.22);border-radius:.42em;padding:.02em .2em;';
        if (active && options.activeWordStyle === 'underline') extra += `text-decoration:underline ${options.highlightColor || '#ffeb3b'} .12em;`;
        if (active && options.activeWordStyle === 'scale') extra += 'transform:scale(1.22) translateY(-3px);filter:brightness(1.28);';
      } else if (mode === 'karaoke') {
        color = active ? (options.highlightColor || '#ffeb3b') : i < idx ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.32)';
      }
      return `<span style="display:inline-flex;line-height:1.1;color:${color};${bgStyle};text-shadow:${shadow};text-transform:${options.textCase === 'upper' ? 'uppercase' : options.textCase === 'title' ? 'capitalize' : 'none'};${extra}">${applyCase(w.text, options.textCase)}</span>`;
    }).join(mode === 'phrase' ? ' ' : '');
    const display = mode === 'phrase' ? 'block' : 'flex';
    const gap = mode === 'phrase' ? '' : 'gap:6px 10px;flex-wrap:wrap;justify-content:center;';
    inner = `<div style="font-size:${sizeClass};font-weight:${mode === 'active_word' ? 800 : 700};letter-spacing:${mode === 'phrase' ? '.03em' : '.025em'};display:${display};${gap};text-align:center;line-height:1.5;">${inner}</div>`;
  }
  const img = imagePath.replace(/\\/g, '/');
  return `<!doctype html><html><body style="margin:0;background:#000;"><div style="position:relative;width:1280px;height:720px;overflow:hidden;background:#000;"><img src="file:///${img}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"><div style="position:absolute;left:0;right:0;${top}display:flex;justify-content:center;pointer-events:none;padding:0 16px;"><div style="max-width:90%;${cueBg}">${inner}</div></div></div></body></html>`;
}

async function exportClip(name, options) {
  const outMp4 = path.join(OUT, `${name}.mp4`);
  const body = {
    sourceUrl: sourcePath,
    startTime: clip.start_time,
    endTime: Math.min(clip.end_time, clip.start_time + 8),
    title: `parity-${name}`,
    subtitles: clip.subtitles || [],
    subtitleOptions: options,
    aspectRatio: 'custom',
    originalStartTime: clip.start_time,
  };
  const res = await fetch('http://127.0.0.1:3001/clip', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${name} export failed ${res.status}: ${await res.text()}`);
  fs.writeFileSync(outMp4, Buffer.from(await res.arrayBuffer()));
  return outMp4;
}

async function main() {
  console.log(`Using job ${job.id}: ${job.title}`);
  console.log(`Using clip ${clip.start_time}-${clip.end_time} from ${sourcePath}`);
  const t = 5.05;
  const bg = path.join(OUT, 'source-frame.jpg');
  execFileSync('ffmpeg', ['-y', '-ss', String(clip.start_time + t), '-i', sourcePath, '-frames:v', '1', '-vf', 'scale=1280:720', bg], { stdio: 'ignore' });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const report = [];
  for (const [name, patch] of cases) {
    const options = { ...baseOptions, ...patch };
    console.log(`CASE ${name}`);
    const html = previewHtml({ options, imagePath: bg, time: t });
    const htmlPath = path.join(OUT, `${name}.html`);
    fs.writeFileSync(htmlPath, html);
    await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
    const previewPng = path.join(OUT, `${name}-preview.png`);
    await page.screenshot({ path: previewPng });
    const mp4 = await exportClip(name, options);
    const exportPng = path.join(OUT, `${name}-export.png`);
    execFileSync('ffmpeg', ['-y', '-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:720', exportPng], { stdio: 'ignore' });
    report.push({ name, options, previewPng, exportPng, mp4 });
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ jobId: job.id, title: job.title, clipStart: clip.start_time, clipEnd: clip.end_time, sourcePath, cases: report }, null, 2));
  console.log(`Wrote ${path.join(OUT, 'report.json')}`);
}
main().catch(e => { console.error(e); process.exit(1); });
