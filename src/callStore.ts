interface CallMeta {
  talentId: string;
  candidateName: string;
}

const store = new Map<string, CallMeta>();
const activeTalents = new Map<string, string>(); // talentId → callSid
const greetingCache = new Map<string, Buffer[]>();

export function registerCall(callSid: string, meta: CallMeta): void {
  store.set(callSid, meta);
  if (meta.talentId !== 'manual') {
    activeTalents.set(meta.talentId, callSid);
  }
}

export function getCallMeta(callSid: string): CallMeta | undefined {
  return store.get(callSid);
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
