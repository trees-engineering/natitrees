import type { CallBrief } from './llm';

export type CallStatus = 'ringing' | 'connected';

interface CallMeta {
  talentId: string;
  candidateName: string;
  isReturning?: boolean;
  callBrief?: CallBrief;
  status: CallStatus;
  startedAt: number;
  connectedAt?: number;
}

type RegisterCallInput = Omit<CallMeta, 'status' | 'startedAt' | 'connectedAt'>;

const store = new Map<string, CallMeta>();
const activeTalents = new Map<string, string>(); // talentId → callSid
const greetingCache = new Map<string, Buffer[]>();

export function registerCall(callSid: string, meta: RegisterCallInput): void {
  store.set(callSid, { ...meta, status: 'ringing', startedAt: Date.now() });
  if (meta.talentId !== 'manual') {
    activeTalents.set(meta.talentId, callSid);
  }
}

// Called once the Twilio media stream actually starts (i.e. the call was answered).
export function markCallConnected(callSid: string): void {
  const meta = store.get(callSid);
  if (!meta) return;
  meta.status = 'connected';
  meta.connectedAt = Date.now();
}

export function getCallMeta(callSid: string): CallMeta | undefined {
  return store.get(callSid);
}

export function getActiveCallSummaries(): Array<{
  callSid: string;
  candidateName: string;
  talentId: string;
  status: CallStatus;
  startedAt: number;
  connectedAt?: number;
}> {
  return [...store.entries()].map(([callSid, meta]) => ({
    callSid,
    candidateName: meta.candidateName,
    talentId: meta.talentId,
    status: meta.status,
    startedAt: meta.startedAt,
    connectedAt: meta.connectedAt,
  }));
}

export function hasActiveCallForTalent(talentId: string): boolean {
  return activeTalents.has(talentId);
}

export function removeCall(callSid: string): void {
  const meta = store.get(callSid);
  if (meta && activeTalents.get(meta.talentId) === callSid) {
    activeTalents.delete(meta.talentId);
  }
  store.delete(callSid);
  greetingCache.delete(callSid);
}

export function storeGreetingAudio(callSid: string, chunks: Buffer[]): void {
  greetingCache.set(callSid, chunks);
}

export function getGreetingAudio(callSid: string): Buffer[] | undefined {
  return greetingCache.get(callSid);
}

export function clearGreetingAudio(callSid: string): void {
  greetingCache.delete(callSid);
}
