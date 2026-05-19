import { supabase } from '../db/supabase';

export interface TalentProfile {
  id: string;
  name: string | null;
  phone: string | null;
  headline: string | null;
  visa_status: string | null;
  work_rights: string | null;
  mobility_regions: string[] | null;
  availability_status: string | null;
  available_from: string | null;
  notice_period_days: number | null;
  rate: number | null;
  rate_type: string | null;
  rotation_preference: string | null;
}

export async function loadProfile(talentId: string): Promise<TalentProfile> {
  const { data, error } = await supabase
    .from('_talent')
    .select(`
      id, name, phone, headline,
      visa_status, work_rights, mobility_regions,
      availability_status, available_from,
      notice_period_days,
      rate, rate_type,
      rotation_preference
    `)
    .eq('id', talentId)
    .single();

  if (error || !data) {
    throw new Error(`[profileLoader] Failed to load talent ${talentId}: ${error?.message}`);
  }

  console.log(`[profileLoader] Loaded: ${data.name ?? talentId}`);
  return data as TalentProfile;
}
