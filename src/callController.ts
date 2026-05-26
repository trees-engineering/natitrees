import twilio from 'twilio';
import { registerCall, hasActiveCallForTalent, storeGreetingAudio } from './callStore';
import { CartesiaTTS } from './providers/tts/cartesia';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function endCall(callSid: string): Promise<void> {
  await client.calls(callSid).update({ status: 'completed' });
  console.log(`[call] Ended programmatically — SID: ${callSid}`);
}

export async function initiateCall(to: string, candidateName: string, talentId: string): Promise<string> {
  if (talentId !== 'manual' && hasActiveCallForTalent(talentId)) {
    throw new Error(`Call already in progress for talent ${talentId}`);
  }

  const twimlUrl = `${process.env.PUBLIC_HTTP_URL}/twiml`;
  const amdCallbackUrl = `${process.env.PUBLIC_HTTP_URL}/amd-status`;

  const call = await client.calls.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER!,
    url: twimlUrl,
    method: 'POST',
    machineDetection: 'Enable',
    asyncAmdStatusCallback: amdCallbackUrl,
    asyncAmdStatusCallbackMethod: 'POST',
  });

  registerCall(call.sid, { talentId, candidateName });
  console.log(`[call] Calling ${candidateName} at ${to} — SID: ${call.sid}`);
  void preGenerateGreeting(call.sid, candidateName);
  return call.sid;
}

async function preGenerateGreeting(callSid: string, candidateName: string): Promise<void> {
  const text = `Hey ${candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better. Is now an okay time?`;
  const tts = new CartesiaTTS();
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of tts.stream(text)) {
      chunks.push(chunk);
    }
    storeGreetingAudio(callSid, chunks);
    console.log(`[greeting] Pre-generated for ${candidateName}`);
  } catch (err) {
    console.error('[greeting] Pre-generation failed — will use real-time TTS:', err);
  }
}
