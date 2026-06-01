import { initiateWaCall } from './graphApi';
import { registerCall, hasActiveCallForTalent, storeGreetingAudio } from '../callStore';
import { CartesiaTTS } from '../providers/tts/cartesia';

export { endWaCall as endCall } from './graphApi';

export async function initiateWhatsAppCall(
  to: string,
  candidateName: string,
  talentId: string,
): Promise<string> {
  if (talentId !== 'manual' && hasActiveCallForTalent(talentId)) {
    throw new Error(`Call already in progress for talent ${talentId}`);
  }

  const callId = await initiateWaCall(to);
  registerCall(callId, { talentId, candidateName });
  console.log(`[wa] Calling ${candidateName} at ${to} — callId: ${callId}`);
  void preGenerateGreeting(callId, candidateName);
  return callId;
}

async function preGenerateGreeting(callId: string, candidateName: string): Promise<void> {
  const text = `Hey ${candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better. Is now an okay time?`;
  const tts = new CartesiaTTS();
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of tts.stream(text)) {
      chunks.push(chunk);
    }
    storeGreetingAudio(callId, chunks);
    console.log(`[wa-greeting] Pre-generated for ${candidateName}`);
  } catch (err) {
    console.error('[wa-greeting] Pre-generation failed — will use real-time TTS:', err);
  }
}
