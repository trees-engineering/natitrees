import type { CallHandler } from './callHandler';

const registry = new Map<string, CallHandler>();

export function registerHandler(callSid: string, handler: CallHandler): void {
  registry.set(callSid, handler);
}

export function getHandler(callSid: string): CallHandler | undefined {
  return registry.get(callSid);
}

export function removeHandler(callSid: string): void {
  registry.delete(callSid);
}

export function getActiveCalls(): Array<{ callSid: string; candidateName: string; talentId: string }> {
  const { getCallMeta } = require('./callStore');
  return [...registry.keys()].map(sid => {
    const meta = getCallMeta(sid);
    return { callSid: sid, candidateName: meta?.candidateName ?? 'Unknown', talentId: meta?.talentId ?? '' };
  });
}
