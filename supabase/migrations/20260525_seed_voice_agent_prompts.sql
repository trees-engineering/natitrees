-- Seed voice agent prompt rows into the shared _prompts table.
-- Master prompt: empty text = agent falls back to the code default in src/llm.ts
-- Secondary prompt: appended after the master on every call

insert into _prompts (key, text, category, prompt_type, label, description)
values
  (
    'voice_agent_master',
    '',
    'voice_agent',
    'master',
    'Master Prompt',
    'Core system prompt for the Treelance voice agent. Empty = use code default in src/llm.ts.'
  ),
  (
    'voice_agent_secondary',
    '',
    'voice_agent',
    'secondary',
    'Secondary Prompt',
    'Additional instructions appended after the master prompt on every call.'
  )
on conflict (key) do nothing;
