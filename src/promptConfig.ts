import { supabase } from './db/supabase';

export interface PromptOverrides {
  masterOverride: string | null;
  secondary: string;
  knowledge: string;
}

const DEFAULTS: PromptOverrides = { masterOverride: null, secondary: '', knowledge: '' };

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

    const master    = data.find(r => r.key === 'voice_agent_master');
    const secondary = data.find(r => r.key === 'voice_agent_secondary');
    const knowledge = data.find(r => r.key === 'voice_agent_knowledge');

    cache = {
      masterOverride: master?.text?.trim() ? master.text : null,
      secondary:  secondary?.text ?? '',
      knowledge:  knowledge?.text ?? '',
    };
  } catch (err) {
    console.warn('[promptConfig] Could not load from DB, using defaults:', err);
  }
}

export async function savePromptOverrides(overrides: PromptOverrides): Promise<void> {
  const now = new Date().toISOString();

  const save = async (key: string, text: string) => {
    const { error } = await supabase
      .from('_prompts')
      .update({ text, updated_at: now })
      .eq('key', key);
    if (error) throw new Error(error.message);
  };

  const saveNew = async (key: string, text: string) => {
    const { data: existing } = await supabase
      .from('_prompts')
      .select('key')
      .eq('key', key)
      .maybeSingle();
    if (existing) {
      await save(key, text);
    } else {
      const { error } = await supabase
        .from('_prompts')
        .insert({ key, category: 'voice_agent', text, updated_at: now });
      if (error) throw new Error(error.message);
    }
  };

  await save('voice_agent_master',    overrides.masterOverride ?? '');
  await save('voice_agent_secondary', overrides.secondary ?? '');
  await saveNew('voice_agent_knowledge', overrides.knowledge ?? '');

  cache = { ...overrides };
}
