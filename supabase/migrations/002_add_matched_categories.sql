-- Add matched_categories to clips so we can store which AI focus categories each clip matched
ALTER TABLE clips ADD COLUMN IF NOT EXISTS matched_categories jsonb DEFAULT '[]';
