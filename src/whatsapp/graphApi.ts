const BASE = 'https://graph.facebook.com/v21.0';

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export async function initiateWaCall(to: string): Promise<string> {
  const res = await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/calls`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ messaging_product: 'whatsapp', to }),
  });
  if (!res.ok) throw new Error(`Graph API initiate call: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function sendSdpAnswer(callId: string, sdpAnswer: string): Promise<void> {
  const res = await fetch(
    `${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/calls/${callId}`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ sdp_answer: sdpAnswer }),
    },
  );
  if (!res.ok) throw new Error(`Graph API SDP answer: ${await res.text()}`);
}

export async function endWaCall(callId: string): Promise<void> {
  await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/calls/${callId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

// Send a pre-call WhatsApp text message.
// NOTE: Meta requires an approved message template for business-initiated
// conversations. This free-text form only works within a 24-hour window
// after the candidate last messaged your number. For cold outreach, create
// an approved template in Meta Business Manager and use sendTemplateMessage.
export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  const res = await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
  });
  if (!res.ok) throw new Error(`Graph API send message: ${await res.text()}`);
}

// Request call permission from a user within an active 24-hour messaging session.
// The user receives a WhatsApp prompt asking to allow calls from your business.
// They must accept before initiateWaCall will succeed.
export async function requestCallPermission(to: string, bodyText: string): Promise<void> {
  const res = await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'call_permission_request',
        body: { text: bodyText },
        action: { name: 'call_permission_request' },
      },
    }),
  });
  if (!res.ok) throw new Error(`Graph API call permission request: ${await res.text()}`);
}

// Send a pre-approved template message — required for cold outreach.
// templateName must match a template you've created and approved in Meta Business Manager.
export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode = 'en',
): Promise<void> {
  const res = await fetch(`${BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name: templateName, language: { code: languageCode } },
    }),
  });
  if (!res.ok) throw new Error(`Graph API send template: ${await res.text()}`);
}
