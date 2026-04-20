# Slicer SQLite + Local Retention Migration Plan

## Goal
Move Slicer off Supabase entirely without breaking the current working alpha flow.

Target end state:
- **No Supabase dependency** for DB, storage, auth, or tunnel discovery
- **SQLite** for job/progress state
- **Local disk** for source media, transcripts, thumbnails, caches
- **7-day retention** for completed jobs/media
- **48-hour retention** for failed jobs
- **Current working features preserved**

## Why this is the right cut
Supabase is no longer doing the core product work. The clipping stack already runs locally:
- download / ingest
- transcription
- clip scoring
- subtitle editing/export
- thumbnail generation
- local media serving via `/serve/...`

Supabase is currently acting mostly as a remote state store for:
- `jobs` CRUD
- progress polling
- usage reporting
- tunnel URL fallback
- progress updates inside `server/youtube-api.js`

That makes it removable.

---

## Non-negotiable rule: do not break current working behavior
The migration must preserve these behaviors exactly or near-exactly:

### Must keep working
1. **Upload flow**
   - local files up to current limits
   - remote URLs
   - direct media URLs
   - X/Twitter / Twitch / YouTube handling

2. **Processing lifecycle**
   - queued / downloading / transcribing / scoring / complete / failed
   - retry path
   - rescore path
   - stale job timeout / recovery
   - progress polling from the dashboard

3. **Clip/gallery behavior**
   - completed jobs visible in Clips tab
   - per-clip delete via stable clip IDs
   - Preview modal
   - subtitle editor behavior
   - subtitle split/merge and stacked timeline work unchanged

4. **Media reuse / reliability**
   - same-broadcast reruns keep reusing on-disk source files
   - transcription cache reuse keeps working
   - thumbnail cache keeps working

5. **Export and social layer**
   - caption generation unchanged
   - subtitle export unchanged
   - watermark / platform format defaults unchanged

6. **Preview / tunnel behavior**
   - local preview still works
   - Cloudflare tunnel still works
   - frontend still resolves API base reliably

### Must NOT change during this migration
- scorer prompts
- clip ranking logic
- subtitle rendering logic
- caption prompt logic
- publish/social placeholder UX

This migration is a **state/storage swap**, not a product-behavior rewrite.

---

## Proposed architecture

## 1. State store: SQLite
Use one local DB file:

- `server/data/slicer.sqlite`

Recommended package:
- `better-sqlite3`

Why:
- trivial local deployment
- synchronous, simple, low-risk for one-machine app
- no ORM needed
- good fit for the current Next API + local worker model

## 2. File store: local disk
Replace the loose `server/temp` dependency with structured local storage.

### Recommended layout
```text
server/
  data/
    slicer.sqlite
    jobs/
      <jobId>/
        source.mp4
        transcript.json
        thumbs/
        artifacts/
    source-cache/
      <cacheKey>/
        source.mp4
        transcript.json
        meta.json
    thumb-cache/
      <thumbHash>.jpg
    exports-temp/
    logs/
      cleanup.log
```

### Folder intent
- `jobs/<jobId>/` = per-job working state
- `source-cache/<cacheKey>/` = reusable asset cache for reruns of the same remote stream/video
- `thumb-cache/` = reusable gallery thumbnails
- `exports-temp/` = export scratch artifacts, still short-lived

---

## Data model

## Table: `jobs`
This replaces the current Supabase `jobs` table.

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'complete', 'failed')),
  input_kind TEXT NOT NULL CHECK (input_kind IN ('remote_url', 'uploaded_file', 'rescore')),
  raw_input_url TEXT,
  source_url TEXT,
  source_path TEXT,
  source_cache_key TEXT,
  options_json TEXT NOT NULL,
  progress_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT,
  last_accessed_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_jobs_source_cache_key ON jobs(source_cache_key);
```

### Notes
- `progress_json` remains the canonical home of `completedClips`
- no separate `clips` table needed
- this matches the current app behavior and avoids risky normalization work

## Table: `source_cache`
Tracks reusable downloaded sources and transcripts.

```sql
CREATE TABLE IF NOT EXISTS source_cache (
  cache_key TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  transcript_path TEXT,
  duration_sec INTEGER DEFAULT 0,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_source_cache_expires_at ON source_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_source_cache_last_used_at ON source_cache(last_used_at DESC);
```

## Optional table: `cleanup_runs`
Useful for debugging retention behavior.

```sql
CREATE TABLE IF NOT EXISTS cleanup_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  jobs_deleted INTEGER DEFAULT 0,
  files_deleted INTEGER DEFAULT 0,
  bytes_deleted INTEGER DEFAULT 0,
  status TEXT NOT NULL,
  notes TEXT
);
```

---

## Retention policy
Retention is based on **job completion state**, not just file age.

## Completed jobs
- retain for **7 days after `completed_at`**
- delete:
  - job row
  - `jobs/<jobId>/` folder
  - any unreferenced source-cache entry if no other live job uses it

## Failed jobs
- retain for **48 hours after `updated_at`**
- delete:
  - job row
  - per-job artifacts
  - leave shared cache only if still referenced / recently used

## Processing jobs
- never delete while `status='processing'`
- stale-job timeout still marks them failed first

## Source/transcript cache
- retain for **7 days since `last_used_at`**
- this preserves the current rerun benefit without letting the machine fill up forever

## Thumb cache
- retain for **7 days since file mtime**

## Export temp artifacts
- retain for **12 hours or less**

## Storage budget guardrails
We should explicitly target a **local Slicer cache budget under 10 GB**.

### Budget definition
The 10 GB target applies to the working storage footprint for:
- `server/data/source-cache/`
- `server/data/thumb-cache/`
- `server/data/exports-temp/`
- any remaining transient temp/source files still needed by active jobs

SQLite itself is negligible by comparison and is not the risk.

### Watermarks
- **Target:** stay under **10 GB**
- **Warning threshold:** **8 GB**
- **Hard cap response:** if cache exceeds **10 GB**, prune oldest reusable cache entries first
- **Safety stop:** if free disk drops below **20 GB**, run aggressive cleanup immediately
- **Last-resort stop:** if free disk drops below **10 GB**, reject new jobs until cleanup frees space

### Prune order when over budget
1. expired completed jobs (>7 days)
2. expired failed jobs (>48h)
3. expired source cache (>7 days since last use)
4. oldest reusable source cache entries by `last_used_at`
5. oldest thumbnails / export temp artifacts

### Critical protection rule
Never prune:
- active processing jobs
- the source file currently backing an active job
- source files still referenced by a non-expired job

### Operational proof point
On 2026-04-20, a one-off historical purge removed the approved expired jobs plus stale root media and dropped the live `server/temp` footprint from roughly **111 GB** to **8.18 GB**, proving the budget is realistic if cleanup is enforced.

### Critical rule
Deletion should always be:
1. mark candidate rows
2. delete files
3. delete DB rows
4. log cleanup result

Never delete the DB row first and orphan files silently.

---

## What expires vs what stays

## Expires
- downloaded source files
- per-job transcript files
- thumbnail cache files
- export temp artifacts
- gallery job entries after TTL

## Stays
- user-downloaded files saved outside Slicer
- active in-progress jobs
- recently reused source cache within TTL
- app code / config / prompt assets

---

## API/store abstraction
Do not rewrite every route straight to SQLite first. Introduce a store boundary.

## New module
- `lib/job-store/types.ts`
- `lib/job-store/sqlite.ts`
- `lib/job-store/supabase.ts`
- `lib/job-store/index.ts`

## Store contract
```ts
interface JobStore {
  listJobs(limit?: number): Promise<Job[]>
  getJob(jobId: string): Promise<Job | null>
  createJob(input: CreateJobInput): Promise<Job>
  updateJob(jobId: string, patch: UpdateJobInput): Promise<Job | null>
  deleteJob(jobId: string): Promise<boolean>
  recoverStaleJob(jobId: string): Promise<Job | null>
  listUsage(): Promise<UsageSnapshot>
  deleteExpiredJobs(nowIso: string): Promise<CleanupResult>
  touchSourceCache(cacheKey: string): Promise<void>
}
```

### Why this matters
This is the safety rail that prevents breaking the app.

It allows:
- feature-flagged cutover
- shadow verification
- rollback without re-editing all routes again

---

## Route-by-route migration map

## `app/api/jobs/route.ts`
### Today
- list/create jobs through Supabase
- normalize source URL
- recover stale jobs

### Change
- swap Supabase calls for `jobStore.listJobs()` / `jobStore.createJob()`
- keep response shape identical
- keep stale-job recovery logic identical, just backed by the store

## `app/api/jobs/[jobId]/route.ts`
### Today
- delete job
- patch job
- retry / rescore logic

### Change
- move storage operations to `jobStore`
- keep retry/rescore payload rules unchanged
- preserve `rawInputUrl` inference behavior exactly

## `app/api/jobs/[jobId]/poll/route.ts`
### Today
- fetch single job + progress + stale recovery

### Change
- read same fields from SQLite-backed store
- keep frontend response payload identical

## `app/api/clips/[clipId]/route.ts`
### Today
- scans jobs, finds clip in `progress.completedClips`, rewrites that array

### Change
- same algorithm, but read/write jobs through store
- still no need for a separate `clips` table

## `app/api/process/route.ts`
### Today
- updates job state before asking `youtube-api.js` to start

### Change
- write progress through store
- keep payload sent to `youtube-api.js` unchanged

## `app/api/usage/route.ts`
### Today
- computes stats from Supabase jobs + storage bucket listings

### Change
- compute usage from SQLite jobs + local disk folder sizes
- rename UI label from `supabase` to `storage` or `localStorage`

## `server/youtube-api.js`
### Today
- pushes progress back to Supabase via REST
- stores temp files on disk
- serves media locally

### Change
- replace `fetchJob`, `updateJob`, `mergeJobProgress` with SQLite-backed versions
- keep clip generation logic untouched
- keep rerun/source-cache logic untouched
- move temp file locations into structured data dirs

## `lib/api-url.ts` and `lib/api-url-server.ts`
### Today
- runtime-config first, Supabase fallback second

### Change
- remove Supabase fallback completely
- keep runtime-config and local fallback only

## `server/start-tunnel.js`
### Today
- writes tunnel URL to file and also uploads to Supabase storage

### Change
- write only to local `tunnel-url.txt`

## `middleware.ts`
### Today
- auth bypassed by `SKIP_AUTH`, otherwise checks Supabase-flavored cookie names

### Change
- for now: leave auth bypass on
- remove Supabase cookie assumptions only when auth is intentionally redesigned

---

## Feature parity checklist before final cutover
The SQLite path is not allowed to become default until all of this passes.

### Core flow
- [ ] create job from remote URL
- [ ] create job from local file
- [ ] process to completion
- [ ] poll progress until complete
- [ ] retry failed job
- [ ] rescore completed job

### Gallery / clip UX
- [ ] clips render in gallery
- [ ] preview modal opens
- [ ] per-clip delete still works
- [ ] job delete still works
- [ ] thumbnail loading still works

### Subtitle/editor/export
- [ ] subtitle timeline renders
- [ ] split / merge works
- [ ] word ordering still correct
- [ ] export still generates video correctly

### Reliability
- [ ] same broadcast rerun reuses on-disk source
- [ ] transcription cache reuse still works
- [ ] stale job becomes failed after timeout
- [ ] TTL sweeper skips active jobs

### Social / caption
- [ ] caption route unaffected
- [ ] publish placeholder UI unaffected

### Local preview / tunnel
- [ ] dashboard still resolves API base
- [ ] Cloudflare preview tunnel still works

---

## Migration order with lowest risk

## Phase 0: Freeze contracts
Do this first.
- document the current request/response shapes
- document `Job` / `JobProgress` invariants
- keep current frontend payloads unchanged

## Phase 1: Introduce SQLite store in parallel
- add `better-sqlite3`
- create schema + migration bootstrap
- add `job-store` abstraction
- do **not** change behavior yet

### Output
- app still runs on Supabase
- SQLite code exists in parallel at `server/data/slicer.sqlite`

### Status on 2026-04-20
This is now live locally:
- `better-sqlite3` installed
- SQLite schema bootstrap added
- shadow-store helpers added in `lib/job-store/*` and `server/lib/sqlite-shadow-store.js`
- `GET/POST/PATCH/DELETE` job routes now mirror snapshots into SQLite while keeping Supabase as the source of truth
- `server/youtube-api.js` now mirrors job-progress writes into SQLite after Supabase updates

## Phase 2: Shadow-write mode
Add env flag:
- `SLICER_JOB_STORE=supabase`
- `SLICER_SHADOW_SQLITE=true`

Behavior:
- keep reads from Supabase
- write to Supabase and SQLite
- diff critical fields after writes and log mismatches

### Status on 2026-04-20
Shadow writes are now active for the main job write paths with Supabase still serving all reads.
The remaining Phase 2 hardening item is explicit parity-diff logging on every mirrored write.

### Why
This is the safest way to prove parity without risking the current working flow.

## Phase 3: SQLite reads for local-only instance
Flip local machine only:
- `SLICER_JOB_STORE=sqlite`
- keep Supabase code available for rollback

Validate every checklist item above.

## Phase 4: Enable retention in dry-run mode
- run sweeper on startup
- run every hour
- log what *would* be deleted
- do not delete for first validation pass

## Phase 5: Enable real deletion
- 7-day TTL for complete
- 48h TTL for failed
- 7-day TTL for source cache
- confirm gallery stays clean and no live jobs vanish

## Phase 6: Remove Supabase dependency fully
Only after SQLite has been stable.
- remove Supabase env vars from runtime requirements
- remove fallback tunnel URL lookup via Supabase
- remove `@supabase/supabase-js`
- update docs / README / setup instructions

---

## Rollback plan
If SQLite cutover misbehaves:
1. switch env back to `SLICER_JOB_STORE=supabase`
2. restart preview + API
3. keep SQLite files for inspection
4. do not run destructive cleanup until parity is proven

This is why the migration must happen behind a store flag.

---

## Exact environment variables to add
```env
SLICER_JOB_STORE=sqlite
SLICER_DATA_DIR=server/data
SLICER_JOB_RETENTION_DAYS=7
SLICER_FAILED_RETENTION_HOURS=48
SLICER_SOURCE_CACHE_RETENTION_DAYS=7
SLICER_THUMB_CACHE_RETENTION_DAYS=7
SLICER_EXPORT_TEMP_RETENTION_HOURS=12
SLICER_SWEEPER_INTERVAL_MIN=60
SLICER_SHADOW_SQLITE=false
```

---

## Files to create
```text
lib/job-store/types.ts
lib/job-store/index.ts
lib/job-store/sqlite.ts
lib/job-store/supabase.ts
lib/job-store/bootstrap.ts
server/lib/retention-sweeper.js
server/data/.gitkeep
```

## Files to edit
```text
app/api/jobs/route.ts
app/api/jobs/[jobId]/route.ts
app/api/jobs/[jobId]/poll/route.ts
app/api/clips/[clipId]/route.ts
app/api/process/route.ts
app/api/usage/route.ts
lib/api-url.ts
lib/api-url-server.ts
server/start-tunnel.js
server/youtube-api.js
components/dashboard/UsageTab.tsx
package.json
README.md
```

---

## What I would NOT do
- do not introduce Prisma just for this
- do not keep both SQLite and a normalized `clips` table unless we actually need query power later
- do not change scoring / subtitles / captions during this migration
- do not enable destructive TTL on day one
- do not remove Supabase code before the store abstraction proves parity

---

## Recommendation
The safest path is:
1. **introduce SQLite behind a store abstraction**
2. **shadow-write before cutover**
3. **switch local reads only after parity checks**
4. **enable retention in dry-run first**
5. **remove Supabase last**

That keeps the current working alpha alive while we replace the brittle part under it.

## Final call
Yes, Slicer can absolutely become:
- local SQLite
- local disk
- 7-day retention
- no Supabase

And if we do it with the store-flag + shadow-write approach, it should not break what is already working.
