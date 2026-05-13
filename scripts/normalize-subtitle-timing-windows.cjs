const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(process.cwd(), 'server/data/slicer.sqlite');
const backupPath = `${dbPath}.subtitle-timing-bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
fs.copyFileSync(dbPath, backupPath);

const db = new Database(dbPath);
const rows = db.prepare("select id, progress_json from jobs where progress_json is not null and deleted_at is null").all();
const update = db.prepare("update jobs set progress_json = ?, updated_at = ? where id = ?");

let jobsChanged = 0;
let clipsChanged = 0;
let wordsRemoved = 0;
let wordsAdjusted = 0;

const normalizeWords = (words = [], duration = null) => {
  const out = [];
  let removed = 0;
  let adjusted = 0;

  for (const word of Array.isArray(words) ? words : []) {
    if (typeof word?.start !== 'number' || typeof word?.end !== 'number' || typeof word?.text !== 'string') {
      removed += 1;
      continue;
    }
    const start = Math.max(0, word.start);
    const upperEnd = typeof duration === 'number' && Number.isFinite(duration) ? duration : word.end;
    const end = Math.min(upperEnd, Math.max(0, word.end));
    if (end <= start) {
      removed += 1;
      continue;
    }
    const next = {
      ...word,
      start: Number(start.toFixed(2)),
      end: Number(end.toFixed(2)),
    };
    if (next.start !== word.start || next.end !== word.end) adjusted += 1;
    out.push(next);
  }

  out.sort((a, b) => (a.start - b.start) || (a.end - b.end));
  return { words: out, removed, adjusted };
};

const tx = db.transaction(() => {
  for (const row of rows) {
    let progress;
    try { progress = JSON.parse(row.progress_json || '{}'); } catch { continue; }
    const clips = Array.isArray(progress.completedClips) ? progress.completedClips : [];
    let jobChanged = false;

    for (const clip of clips) {
      const duration = typeof clip?.duration === 'number'
        ? clip.duration
        : (typeof clip?.start_time === 'number' && typeof clip?.end_time === 'number' ? clip.end_time - clip.start_time : null);
      const before = Array.isArray(clip?.subtitles) ? clip.subtitles.length : 0;
      const { words, removed, adjusted } = normalizeWords(clip?.subtitles, duration);
      if (removed || adjusted || words.length !== before) {
        clip.subtitles = words;
        jobChanged = true;
        clipsChanged += 1;
        wordsRemoved += removed;
        wordsAdjusted += adjusted;
      }
    }

    if (jobChanged) {
      jobsChanged += 1;
      update.run(JSON.stringify(progress), new Date().toISOString(), row.id);
    }
  }
});

tx();
console.log(JSON.stringify({ backupPath, jobsChanged, clipsChanged, wordsRemoved, wordsAdjusted }, null, 2));
