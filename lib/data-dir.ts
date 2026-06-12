import path from 'path'

/**
 * Single source of truth for where the SQLite data lives on the Next side.
 * (server/youtube-api.js and its libs are plain CJS and resolve the same env
 * in server/lib/sqlite-shadow-store.js — keep the two in lockstep.)
 *
 * SLICER_DATA_DIR must be an ABSOLUTE path in production: relative values
 * resolve against process.cwd(), which differs between the Next process and
 * the media server and silently recreates the second-empty-database bug this
 * exists to kill.
 */
export function resolveDataDir(): string {
  const env = (process.env.SLICER_DATA_DIR || '').trim()
  if (env) {
    if (!path.isAbsolute(env)) {
      console.warn(`[data-dir] SLICER_DATA_DIR ("${env}") is not absolute — resolving against cwd. Use an absolute path in production.`)
    }
    return path.resolve(env)
  }
  return path.join(process.cwd(), 'server', 'data')
}

export const DATA_DIR = resolveDataDir()
export const DB_PATH = path.join(DATA_DIR, 'slicer.sqlite')
