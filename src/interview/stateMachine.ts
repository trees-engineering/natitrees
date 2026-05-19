import { FieldDefinition } from './profileDiff';

export class InterviewStateMachine {
  private pending: FieldDefinition[];
  private answered: Map<string, string> = new Map();

  constructor(missingFields: FieldDefinition[]) {
    this.pending = [...missingFields];
    console.log(`[stateMachine] Fields to collect: ${this.pending.map(f => f.key).join(', ') || 'none'}`);
  }

  getCurrentField(): FieldDefinition | null {
    return this.pending[0] ?? null;
  }

  markAnswered(key: string, value: string): void {
    this.answered.set(key, value);
    this.pending = this.pending.filter(f => f.key !== key);
    console.log(`[stateMachine] ✓ ${key}: "${value}"`);
    console.log(`[stateMachine] Remaining: ${this.pending.map(f => f.key).join(', ') || 'none'}`);
  }

  isComplete(): boolean {
    return this.pending.length === 0;
  }

  getAnswers(): Record<string, string> {
    return Object.fromEntries(this.answered);
  }

  getPendingFields(): FieldDefinition[] {
    return [...this.pending];
  }
}
