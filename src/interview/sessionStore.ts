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
