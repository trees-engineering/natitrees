-- Manual test calls (Twilio calls to a number typed into the dashboard) and
-- browser mic test sessions were never being saved to _assessments at all,
-- because both paths lack a linked talent_id. This adds:
--   candidate_name — so talent-less rows still show a readable name
--   call_type      — distinguishes real candidate calls from test calls
-- Existing rows are all real candidate calls placed via Twilio, so they
-- backfill correctly under the default.

ALTER TABLE public._assessments
  ADD COLUMN IF NOT EXISTS candidate_name text,
  ADD COLUMN IF NOT EXISTS call_type text NOT NULL DEFAULT 'candidate';
