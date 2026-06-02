-- Stores snapshots of the voice agent system prompt saved from the dashboard.
-- Each row captures the master and secondary prompt text at the time of saving.
-- The dashboard reads the 10 most recent rows for the Version History panel.

create table public._prompt_versions (
  id uuid not null default gen_random_uuid(),
  master text not null,
  secondary text not null default '',
  created_at timestamp with time zone not null default now(),
  constraint _prompt_versions_pkey primary key (id)
);
