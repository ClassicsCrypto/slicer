const Database = require('better-sqlite3')

const db = new Database('server/data/slicer.sqlite')
const niftyTitlePattern = /(nifty island|island raiders|raiders rise|raiders ride|another raid is on deck|whiskerbeards? rest|whiskerbeard)/i
const wrongContextPattern = /\b(Valorant|Overwatch|Call of Duty) \(shooter\)/i

const rows = db.prepare(`
  select id, title, progress_json
  from jobs
  where deleted_at is null
  order by datetime(created_at) desc
`).all()

const update = db.prepare(`update jobs set progress_json = ?, updated_at = ? where id = ?`)
let changed = 0
const now = new Date().toISOString()

for (const row of rows) {
  const progress = JSON.parse(row.progress_json || '{}')
  if (!niftyTitlePattern.test(row.title || '')) continue
  if (!wrongContextPattern.test(progress.streamContext || '')) continue
  progress.streamContext = 'Nifty Island (general gaming)'
  if (progress.progress && /Context locked: (Valorant|Overwatch|Call of Duty)\./i.test(progress.progress)) {
    progress.progress = progress.progress.replace(/Context locked: (Valorant|Overwatch|Call of Duty)\./i, 'Context locked: Nifty Island.')
  }
  update.run(JSON.stringify(progress), now, row.id)
  changed += 1
  console.log(`fixed ${row.id}: ${row.title}`)
}

console.log(`updated ${changed} job(s)`)
