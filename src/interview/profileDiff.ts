import { TalentProfile } from './profileLoader';

export interface FieldDefinition {
  key: string;
  label: string;
  columns: string[];
}

export const REQUIRED_FIELDS: FieldDefinition[] = [
  { key: 'visa_status',   label: 'visa status',               columns: ['visa_status'] },
  { key: 'work_rights',   label: 'right-to-work countries',   columns: ['work_rights', 'mobility_regions'] },
  { key: 'availability',  label: 'availability / start date', columns: ['available_from', 'availability_status'] },
  { key: 'notice_period', label: 'notice period',             columns: ['notice_period_days'] },
  { key: 'rate',          label: 'rate expectation',          columns: ['rate', 'rate_type'] },
  { key: 'contract_type', label: 'contract preference',       columns: ['rotation_preference'] },
];

export function computeMissingFields(profile: TalentProfile): FieldDefinition[] {
  return REQUIRED_FIELDS.filter(field =>
    field.columns.every(col => {
      const val = (profile as Record<string, unknown>)[col];
      return val === null || val === undefined || val === '' ||
        (Array.isArray(val) && val.length === 0);
    })
  );
}
