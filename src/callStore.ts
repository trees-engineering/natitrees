interface CallMeta {
  talentId: string;
  candidateName: string;
}

const store = new Map<string, CallMeta>();

export function registerCall(callSid: string, meta: CallMeta): void {
  store.set(callSid, meta);
}

export function getCallMeta(callSid: string): CallMeta | undefined {
  return store.get(callSid);
}

export function removeCall(callSid: string): void {
  store.delete(callSid);
}
