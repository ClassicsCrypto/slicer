const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(process.cwd(), 'server/data/slicer.sqlite');
const backupPath = `${dbPath}.clip-reasons-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(dbPath, backupPath);

function clipReasonQuote(text, cuePattern = null) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const words = clean.split(' ');
  const lowerWords = words.map((word) => word.toLowerCase().replace(/[^a-z0-9']/g, ''));
  let index = 0;
  if (cuePattern) {
    const foundIndex = lowerWords.findIndex((word, wordIndex) => cuePattern.test(`${word} ${lowerWords[wordIndex + 1] || ''}`.trim()));
    if (foundIndex >= 0) index = foundIndex;
  }
  const start = Math.max(0, index - 3);
  const quote = words.slice(start, Math.min(words.length, start + 9)).join(' ');
  return quote.length > 70 ? `${quote.slice(0, 67).trim()}...` : quote;
}

function buildSpecificClipReason(prefix, text, cuePattern = null) {
  const quote = clipReasonQuote(text, cuePattern);
  return quote ? `${prefix}: “${quote}”` : prefix;
}

function buildClipReasonFromWindow(clipText, detectionMode) {
  const text = String(clipText || '').trim();
  if (!text) return 'Strong moment from the stream';
  const lowered = text.toLowerCase();
  if (/(triple kill|killing spree|killing frenzy|double kill|multi.?kill)/.test(lowered)) return buildSpecificClipReason('Multi-kill payoff', text, /triple|double|multi|killing/).slice(0, 120);
  if (/(clutch|ace|wiped|wipe|headshot|one shot|sniper|revenge|got one|got two|killed|kill)/.test(lowered)) return buildSpecificClipReason('Kill/payoff moment', text, /clutch|ace|wipe|headshot|shot|sniper|revenge|got|killed|kill/).slice(0, 120);
  if (/(caps? the flag|got our flag|got the flag|flag secured|captured the flag|stole the flag|protect the boxes|get to the dock|dock|sharks?)/.test(lowered)) return buildSpecificClipReason('Objective swing', text, /flag|boxes|dock|shark|protect/).slice(0, 120);
  if (/(won|victory|raid complete|wave cleared|goal|champion|we did it)/.test(lowered)) return buildSpecificClipReason('Win/clear payoff', text, /won|victory|complete|cleared|goal|champion/).slice(0, 120);
  if (/(bruh|lmao|haha|wtf|no way|oh shit|oh god|screaming|let'?s go)/.test(lowered) || detectionMode === 'funny') return buildSpecificClipReason('Reaction spike', text, /bruh|lmao|haha|wtf|way|shit|god|screaming|go/).slice(0, 120);
  return buildSpecificClipReason('Clear stream moment', text).slice(0, 120);
}

const GENERIC = new Set([
  'Gameplay payoff with a strong reaction',
  'Objective swing with a live reaction',
  'A clean win or objective swing',
  'Funny reaction with a clear payoff',
  'Memorable moment with a clear reaction',
  'Strong moment from the stream',
]);

const db = new Database(dbPath);
const rows = db.prepare("select id, progress_json from jobs where progress_json is not null and deleted_at is null order by datetime(updated_at) desc limit 50").all();
const update = db.prepare('update jobs set progress_json = ?, updated_at = ? where id = ?');
let jobsChanged = 0;
let clipsChanged = 0;

const tx = db.transaction(() => {
  for (const row of rows) {
    let progress;
    try { progress = JSON.parse(row.progress_json || '{}'); } catch { continue; }
    const clips = Array.isArray(progress.completedClips) ? progress.completedClips : [];
    let changed = false;
    for (const clip of clips) {
      const current = String(clip.ai_reason || '').trim();
      if (current && !GENERIC.has(current)) continue;
      const text = Array.isArray(clip.subtitles) ? clip.subtitles.map((word) => word.text).join(' ') : '';
      const next = buildClipReasonFromWindow(text, progress.detectionMode || progress.clipScorer || 'gaming');
      if (next && next !== current) {
        clip.ai_reason = next;
        clipsChanged += 1;
        changed = true;
      }
    }
    if (changed) {
      jobsChanged += 1;
      update.run(JSON.stringify(progress), new Date().toISOString(), row.id);
    }
  }
});

tx();
console.log(JSON.stringify({ backupPath, jobsChanged, clipsChanged }, null, 2));
