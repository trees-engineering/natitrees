-- Add label and version_number to prompt version snapshots.
-- Backfills version_number for existing rows (oldest = v1).

ALTER TABLE public._prompt_versions
  ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS version_number integer;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public._prompt_versions
)
UPDATE public._prompt_versions
SET version_number = numbered.rn
FROM numbered
WHERE public._prompt_versions.id = numbered.id;
