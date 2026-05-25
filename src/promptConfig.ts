import { supabase } from './db/supabase';

export interface PromptOverrides {
  masterOverride: string | null;
  secondary: string;
}

const DEFAULTS: PromptOverrides = { masterOverride: null, secondary: '' };

// In-memory cache — keeps buildSystemPrompt() synchronous on every call
let cache: PromptOverrides = { ...DEFAULTS };

export function loadPromptOverrides(): PromptOverrides {
  return cache;
}

export async function initPromptConfig(): Promise<void> {
  try {
    const { data } = await supabase
      .from('_prompts')
      .select('key, text')
      .eq('category', 'voice_agent');

    if (!data) return;

    const master = data.find(r => r.key === 'voice_agent_master');
    const secondary = data.find(r => r.key === 'voice_agent_secondary');

    cache = {
      masterOverride: master?.text?.trim() ? master.text : null,
      secondary: secondary?.text ?? '',
    };
  } catch (err) {
    console.warn('[promptConfig] Could not load from DB, using defaults:', err);
  }
}

export async function savePromptOverrides(overrides: PromptOverrides): Promise<void> {
  const now = new Date().toISOString();

  const { error: e1 } = await supabase
    .from('_prompts')
    .update({ text: overrides.masterOverride ?? '', updated_at: now })
    .eq('key', 'voice_agent_master');

  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from('_prompts')
    .update({ text: overrides.secondary ?? '', updated_at: now })
    .eq('key', 'voice_agent_secondary');

  if (e2) throw new Error(e2.message);

  cache = { ...overrides };
}
