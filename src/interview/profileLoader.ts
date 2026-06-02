import { supabase } from '../db/supabase';

export interface TalentSkill {
  skill_name: string;
  proficiency_level: number | null;
  years_experience: number | null;
}

export interface TalentProfile {
  id: string;
  name: string | null;
  phone: string | null;
  headline: string | null;
  // Location
  location: string | null;
  city: string | null;
  country: string | null;
  // Visa & work rights
  visa_status: string | null;
  sponsorship_required: boolean | null;
  work_rights: string | null;
  mobility_regions: string[] | null;
  // Availability
  availability_status: string | null;
  available_from: string | null;
  notice_period_days: number | null;
  // Rate & contract
  rate: number | null;
  rate_type: string | null;
  currency: string | null;
  desired_salary_min: number | null;
  desired_salary_max: number | null;
  rotation_preference: string | null;
  // Professional identity
  job_family: string | null;
  job_function: string | null;
  secondary_functions: string[] | null;
  primary_discipline: string | null;
  secondary_disciplines: string[] | null;
  discipline: string | null;
  career_track: string | null;
  role_archetype: string | null;
  seniority_level: string | null;
  authority_level: string | null;
  tl_band: number | null;
  // Experience breadth
  asset_verticals: string[] | null;
  asset_experience: string[] | null;
  primary_systems: string[] | null;
  regional_experience: string[] | null;
  regions_worked: string[] | null;
  phase_exposure: string[] | null;
  work_environments_experienced: string[] | null;
  deliverables: string[] | null;
  industries: string[] | null;
  // Credentials & education
  certifications: string[] | null;
  credentials_v2: unknown[] | null;
  education: unknown[] | null;
  education_level: string | null;
  education_field: string | null;
  // Languages & soft skills
  languages: string[] | null;
  soft_skills: string[] | null;
  // Rich experience data (jsonb)
  experiences: unknown[] | null;
  deliverables_v2: unknown[] | null;
  scale_factors: Record<string, unknown> | null;
  // Joined from _talent_skills
  skills: TalentSkill[];
  // Most recent previous assessment summary
  previousAssessmentSummary: string | null;
}

export async function loadProfile(talentId: string): Promise<TalentProfile> {
  const [profileResult, skillsResult, assessmentResult] = await Promise.all([
    supabase
      .from('_talent')
      .select(`
        id, name, phone, headline,
        location, city, country,
        visa_status, sponsorship_required, work_rights, mobility_regions,
        availability_status, available_from, notice_period_days,
        rate, rate_type, currency, desired_salary_min, desired_salary_max, rotation_preference,
        job_family, job_function, secondary_functions,
        primary_discipline, secondary_disciplines, discipline,
        career_track, role_archetype, seniority_level, authority_level, tl_band,
        asset_verticals, asset_experience, primary_systems,
        regional_experience, regions_worked,
        phase_exposure, work_environments_experienced,
        deliverables, industries,
        certifications, credentials_v2, education, education_level, education_field,
        languages, soft_skills,
        experiences, deliverables_v2, scale_factors
      `)
      .eq('id', talentId)
      .single(),
    supabase
      .from('_talent_skills')
      .select('skill_name, proficiency_level, years_experience')
      .eq('talent_id', talentId),
    supabase
      .from('_assessments')
      .select('transcript')
      .eq('talent_id', talentId)
      .eq('assessor_type', 'ai')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (profileResult.error || !profileResult.data) {
    throw new Error(`[profileLoader] Failed to load talent ${talentId}: ${profileResult.error?.message}`);
  }

  const skills: TalentSkill[] = (skillsResult.data ?? []) as TalentSkill[];
  const previousAssessmentSummary = assessmentResult.data?.[0]?.transcript ?? null;

  console.log(
    `[profileLoader] Loaded: ${profileResult.data.name ?? talentId} ` +
    `(${skills.length} skills, prior call: ${previousAssessmentSummary ? 'yes' : 'no'})`
  );

  return { ...profileResult.data, skills, previousAssessmentSummary } as TalentProfile;
}
