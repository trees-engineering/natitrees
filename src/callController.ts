import twilio from 'twilio';
import { registerCall, hasActiveCallForTalent } from './callStore';

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
  return call.sid;
}
