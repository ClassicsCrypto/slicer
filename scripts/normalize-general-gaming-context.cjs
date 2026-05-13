const Database = require('better-sqlite3')
const db = new Database('server/data/slicer.sqlite')
const rows = db.prepare(`select id, progress_json from jobs where deleted_at is null and progress_json like '%general gaming (general gaming)%'`).all()
const update = db.prepare(`update jobs set progress_json = ?, updated_at = ? where id = ?`)
const now = new Date().toISOString()
let changed = 0
for (const row of rows) {
  const progress = JSON.parse(row.progress_json || '{}')
  progress.streamContext = String(progress.streamContext || '').replace(/general gaming \(general gaming\)/gi, 'general gaming')
  if (progress.progress) progress.progress = String(progress.progress).replace(/general gaming \(general gaming\)/gi, 'general gaming')
  update.run(JSON.stringify(progress), now, row.id)
  changed += 1
  console.log(`normalized ${row.id}`)
}
console.log(`updated ${changed} job(s)`)
