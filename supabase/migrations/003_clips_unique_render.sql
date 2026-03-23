-- Prevent duplicate clip inserts for the same render ID per job
-- This enforces deduplication at the DB level instead of relying on app logic
ALTER TABLE clips ADD COLUMN IF NOT EXISTS render_id text;
CREATE UNIQUE INDEX IF NOT EXISTS clips_job_render_unique ON clips (job_id, render_id);
