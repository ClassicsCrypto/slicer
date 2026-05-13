const Database = require('better-sqlite3')

const db = new Database('server/data/slicer.sqlite')
const unsupportedSpecificContext = /\b(Valorant|Overwatch|Call of Duty|Apex Legends|Fortnite|League of Legends|Minecraft) \([^)]*\)/i
const explicitGameByName = /\b(valorant|overwatch|call of duty|warzone|apex legends|fortnite|league of legends|minecraft|nifty island|pixels|arc raiders)\b/i
const niftyTitlePattern = /(island raiders|raiders rise|raiders ride|another raid is on deck|whiskerbeards? rest|whiskerbeard)/i

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
  const current = String(progress.streamContext || '')
  if (!unsupportedSpecificContext.test(current)) continue

  const title = String(row.title || '')
  const replacement = niftyTitlePattern.test(title)
    ? 'Nifty Island (general gaming)'
    : explicitGameByName.test(title)
      ? null
      : 'general gaming'
  if (!replacement) continue

  progress.streamContext = replacement
  if (progress.progress && /Context locked: [^.]+\./i.test(progress.progress)) {
    progress.progress = progress.progress.replace(/Context locked: [^.]+\./i, `Context locked: ${replacement.replace(/ \([^)]*\)$/, '')}.`)
  }
  update.run(JSON.stringify(progress), now, row.id)
  changed += 1
  console.log(`fixed ${row.id}: ${title} -> ${replacement}`)
}

console.log(`updated ${changed} job(s)`)
