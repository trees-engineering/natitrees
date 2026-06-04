import { loadProfile, TalentProfile } from './profileLoader';
import { computeMissingFields, FieldDefinition } from './profileDiff';
import { InterviewStateMachine } from './stateMachine';
import { supabase } from '../db/supabase';
import { ConversationMessage } from '../llm';

export class SessionStore {
  private talentId: string;
  private profile: TalentProfile | null = null;
  private stateMachine: InterviewStateMachine | null = null;

  constructor(talentId: string) {
    this.talentId = talentId;
  }

  async load(): Promise<void> {
    this.profile = await loadProfile(this.talentId);
    const missing = computeMissingFields(this.profile);
    this.stateMachine = new InterviewStateMachine(missing);
  }

  getCandidateName(): string {
    return this.profile?.name ?? 'there';
  }

  getHeadline(): string | null {
    return this.profile?.headline ?? null;
  }

  getMissingFields(): FieldDefinition[] {
    return this.stateMachine?.getPendingFields() ?? [];
  }

  getCurrentField(): FieldDefinition | null {
    return this.stateMachine?.getCurrentField() ?? null;
  }

  markAnswered(key: string, value: string): void {
    this.stateMachine?.markAnswered(key, value);
  }

  isComplete(): boolean {
    return this.stateMachine?.isComplete() ?? false;
  }

  getProfileContext(): Record<string, string> {
    return buildProfileContext(this.profile);
  }

  async save(history: ConversationMessage[]): Promise<void> {
    if (!this.profile) {
      console.warn('[sessionStore] No profile — skipping save');
      return;
    }

    const transcript = history.map(m => `[${m.role}] ${m.content}`).join('\n');
    const answers = this.stateMachine?.getAnswers() ?? {};
    const stillMissing = this.stateMachine?.getPendingFields().map(f => f.key) ?? [];

    const aiSummary = JSON.stringify({
      answers_collected: answers,
      fields_still_missing: stillMissing,
    });

    const { error } = await supabase
      .from('_assessments')
      .insert({
        talent_id: this.talentId,
        transcript,
        ai_summary: aiSummary,
        assessor_type: 'ai',
        channel: 'call',
      });

    if (error) {
      console.error('[sessionStore] Failed to save:', error.message);
    } else {
      console.log('[sessionStore] Saved to _assessments');
    }
  }
}

export function buildProfileContext(p: TalentProfile | null): Record<string, string> {
  if (!p) return {};
  const ctx: Record<string, string> = {};

  const add = (key: string, val: string | null | undefined) => {
    if (val && val.trim()) ctx[key] = val;
  };
  const addArr = (key: string, arr: string[] | null | undefined) => {
    if (arr?.length) ctx[key] = arr.join(', ');
  };

  // Basic
  add('Headline', p.headline);
  const locationParts = [p.city, p.country, p.location].filter(Boolean);
  if (locationParts.length) ctx['Location'] = locationParts.join(', ');

  // Professional identity — keys match MATCHING_FIELDS gap detection in llm.ts
  add('Job function', p.job_function);
  addArr('Secondary functions', p.secondary_functions);
  add('Discipline', p.primary_discipline ?? p.discipline);
  addArr('Secondary disciplines', p.secondary_disciplines);
  add('Job family', p.job_family);
  add('Role type', p.career_track);
  add('Current role and title', p.role_archetype);
  add('Seniority and authority', [p.seniority_level, p.authority_level].filter(Boolean).join(' / ') || null);
  if (p.tl_band != null) ctx['Years of experience'] = `TL band ${p.tl_band}`;

  // Experience breadth
  addArr('Asset sectors', p.asset_verticals?.length ? p.asset_verticals : p.asset_experience ?? []);
  addArr('Systems and equipment', p.primary_systems);
  addArr('Project phases', p.phase_exposure);
  addArr('Regions worked', p.regions_worked?.length ? p.regions_worked : p.regional_experience ?? []);
  addArr('Work environment', p.work_environments_experienced);
  addArr('Deliverables owned', p.deliverables);
  addArr('Industries', p.industries);

  // Credentials & education
  addArr('Certifications and licences', p.certifications);
  add('Education level', p.education_level);
  add('Education field', p.education_field);
  addArr('Languages', p.languages);
  addArr('Soft skills', p.soft_skills);

  // Rich jsonb — serialised for the LLM to read
  if (Array.isArray(p.experiences) && p.experiences.length > 0) {
    ctx['Work experience'] = JSON.stringify(p.experiences);
  }
  if (Array.isArray(p.credentials_v2) && p.credentials_v2.length > 0) {
    ctx['Credentials detail'] = JSON.stringify(p.credentials_v2);
  }
  if (Array.isArray(p.deliverables_v2) && p.deliverables_v2.length > 0) {
    ctx['Deliverables detail'] = JSON.stringify(p.deliverables_v2);
  }
  if (Array.isArray(p.education) && p.education.length > 0) {
    ctx['Education history'] = JSON.stringify(p.education);
  }
  if (p.scale_factors && Object.keys(p.scale_factors).length > 0) {
    ctx['Project scale'] = JSON.stringify(p.scale_factors);
  }

  // Skills from _talent_skills
  if (p.skills.length > 0) {
    ctx['Tools and software'] = p.skills
      .map(s => {
        let label = s.skill_name;
        if (s.years_experience) label += ` (${s.years_experience}y)`;
        return label;
      })
      .join(', ');
  }

  // Availability & commercial
  add('Visa status', p.visa_status);
  add('Work rights', p.work_rights);
  addArr('Mobility', p.mobility_regions);
  add('Availability', p.availability_status);
  add('Available from', p.available_from);
  if (p.notice_period_days != null) ctx['Notice period'] = `${p.notice_period_days} days`;
  if (p.rate != null) {
    let rateStr = String(p.rate);
    if (p.currency) rateStr += ` ${p.currency}`;
    if (p.rate_type) rateStr += ` (${p.rate_type})`;
    ctx['Rate'] = rateStr;
  }
  if (p.desired_salary_min != null || p.desired_salary_max != null) {
    const min = p.desired_salary_min ?? '?';
    const max = p.desired_salary_max ?? '?';
    ctx['Desired salary'] = `${min}–${max}${p.currency ? ` ${p.currency}` : ''}`;
  }
  add('Contract preference', p.rotation_preference);
  if (p.sponsorship_required != null) {
    ctx['Sponsorship required'] = p.sponsorship_required ? 'Yes' : 'No';
  }

  // Previous call context
  if (p.previousAssessmentSummary) {
    ctx['Previous call summary'] = p.previousAssessmentSummary;
  }

  return ctx;
}
