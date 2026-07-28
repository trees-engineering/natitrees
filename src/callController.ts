import twilio from 'twilio';
import { registerCall, hasActiveCallForTalent, storeGreetingAudio } from './callStore';
import { CartesiaTTS } from './providers/tts/cartesia';
import { supabase } from './db/supabase';

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
  const statusCallbackUrl = `${process.env.PUBLIC_HTTP_URL}/call-status`;

  const [call, assessmentResult, briefResult] = await Promise.all([
    client.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: twimlUrl,
      method: 'POST',
      machineDetection: 'Enable',
      asyncAmdStatusCallback: amdCallbackUrl,
      asyncAmdStatusCallbackMethod: 'POST',
      statusCallback: statusCallbackUrl,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['failed', 'busy', 'no-answer', 'canceled'],
    }),
    talentId !== 'manual'
      ? supabase.from('_assessments').select('id').eq('talent_id', talentId).eq('assessor_type', 'ai').limit(1)
      : Promise.resolve({ data: [] }),
    talentId !== 'manual'
      ? supabase.from('_call_briefs').select('fields, custom_questions').eq('talent_id', talentId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  console.log(`[returning-check] talentId=${talentId} data=${JSON.stringify(assessmentResult.data)} error=${JSON.stringify((assessmentResult as any).error)}`);
  const isReturning = !!(assessmentResult.data && assessmentResult.data.length > 0);

  const callBrief = briefResult.data
    ? { fields: briefResult.data.fields ?? [], customQuestions: briefResult.data.custom_questions ?? '' }
    : undefined;

  registerCall(call.sid, { talentId, candidateName, isReturning, callBrief });
  console.log(`[call] Calling ${candidateName} at ${to} — SID: ${call.sid} (returning=${isReturning})`);
  if (talentId !== 'manual') {
    void preGenerateGreeting(call.sid, candidateName, isReturning);
  }
  return call.sid;
}

async function preGenerateGreeting(callSid: string, candidateName: string, isReturning: boolean): Promise<void> {
  const text = isReturning
    ? `Hey ${candidateName}, it's Treelance again from Trees OS. Good to speak with you. Is now a good time?`
    : `Hey ${candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better. Is now an okay time?`;
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
