import 'dotenv/config';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { CallHandler } from './callHandler';
import { initiateCall, endCall } from './callController';
import { loadProfile } from './interview/profileLoader';
import { registerDashboardRoutes } from './dashboardRoutes';
import { initPromptConfig } from './promptConfig';
import { initiateWhatsAppCall } from './whatsapp/callController';
import { sendWhatsAppMessage, requestCallPermission } from './whatsapp/graphApi';
import { WhatsAppCallHandler, getWaHandler } from './whatsapp/callHandler';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Dashboard — served at /dashboard, API at /api/dashboard/*
registerDashboardRoutes(app);
app.use('/dashboard', express.static(path.join(__dirname, '../dashboard')));
app.get('/', (_req, res) => res.redirect('/dashboard'));

// Twilio fetches this when the outbound call is answered.
// It tells Twilio to connect the call audio to our WebSocket.
app.post('/twiml', (_req, res) => {
  const wsUrl = process.env.PUBLIC_WS_URL;
  if (!wsUrl) {
    res.status(500).send('PUBLIC_WS_URL not set');
    return;
  }
  res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" />
  </Connect>
</Response>`);
});

// Twilio posts here when answering machine detection completes.
// If it's a machine, hang up silently.
app.post('/amd-status', async (req, res) => {
  const { CallSid, AnsweredBy } = req.body as { CallSid: string; AnsweredBy: string };
  res.sendStatus(204);
  if (AnsweredBy && AnsweredBy !== 'human') {
    console.log(`[amd] Voicemail detected (${AnsweredBy}) — hanging up SID: ${CallSid}`);
    try {
      await endCall(CallSid);
    } catch (err) {
      console.error('[amd] Failed to hang up:', err);
    }
  }
});

// Trigger an outbound call to a candidate.
// POST /call  { "talentId": "abc-123" }
app.post('/call', async (req, res) => {
  const { talentId } = req.body as { talentId: string };

  if (!talentId) {
    res.status(400).json({ error: 'Missing "talentId"' });
    return;
  }

  try {
    const profile = await loadProfile(talentId);

    if (!profile.phone) {
      res.status(400).json({ error: `No phone number on file for talent ${talentId}` });
      return;
    }

    const candidateName = profile.name ?? 'Candidate';
    const callSid = await initiateCall(profile.phone, candidateName, talentId);
    res.json({ success: true, callSid });
  } catch (err) {
    console.error('Failed to initiate call:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── WhatsApp routes ────────────────────────────────────────────────────────

// Meta calls this GET to verify your webhook URL in the developer console.
app.get('/wa/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Meta posts call events here (ringing, accepted with SDP, ended, declined).
app.post('/wa/webhook', (req, res) => {
  res.sendStatus(200); // acknowledge immediately — Meta requires fast response
  const entries: unknown[] = req.body?.entry ?? [];
  for (const entry of entries as Array<{ changes?: Array<{ value?: { calls?: Array<{ call_id: string; status: string; sdp?: string }> } }> }>) {
    for (const change of entry.changes ?? []) {
      for (const call of change.value?.calls ?? []) {
        if (call.status === 'accepted' && call.sdp) {
          console.log(`[wa-webhook] Call accepted — callId: ${call.call_id}`);
          if (!getWaHandler(call.call_id)) {
            new WhatsAppCallHandler(call.call_id, call.sdp);
          }
        } else if (call.status === 'ended' || call.status === 'declined' || call.status === 'no_answer') {
          console.log(`[wa-webhook] Call ${call.status} — callId: ${call.call_id}`);
          getWaHandler(call.call_id)?.end();
        }
      }
    }
  }
});

// Send a pre-call WhatsApp message to warm up the candidate before calling.
// POST /wa/message  { "to": "+60123456789", "message": "Hi, we'd like to chat!" }
app.post('/wa/message', async (req, res) => {
  const { to, message } = req.body as { to: string; message: string };
  if (!to || !message) {
    res.status(400).json({ error: 'Missing "to" or "message"' });
    return;
  }
  try {
    await sendWhatsAppMessage(to, message);
    res.json({ success: true });
  } catch (err) {
    console.error('[wa] Failed to send message:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Request call permission from a candidate before calling.
// POST /wa/request-permission  { "to": "+601234567890" }
app.post('/wa/request-permission', async (req, res) => {
  const { to } = req.body as { to: string };
  if (!to) {
    res.status(400).json({ error: 'Missing "to"' });
    return;
  }
  try {
    await requestCallPermission(to);
    res.json({ success: true });
  } catch (err) {
    console.error('[wa] Failed to send call permission request:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Trigger a WhatsApp outbound call to a candidate.
// POST /wa/call  { "talentId": "abc-123" }
app.post('/wa/call', async (req, res) => {
  const { talentId } = req.body as { talentId: string };
  if (!talentId) {
    res.status(400).json({ error: 'Missing "talentId"' });
    return;
  }
  try {
    const profile = await loadProfile(talentId);
    if (!profile.phone) {
      res.status(400).json({ error: `No phone number on file for talent ${talentId}` });
      return;
    }
    const candidateName = profile.name ?? 'Candidate';
    const callId = await initiateWhatsAppCall(profile.phone, candidateName, talentId);
    res.json({ success: true, callId });
  } catch (err) {
    console.error('[wa] Failed to initiate call:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// Manual WhatsApp call by phone number — for testing without a talentId.
// POST /wa/call-manual  { "name": "John", "phone": "+601234567890" }
app.post('/wa/call-manual', async (req, res) => {
  const { name, phone } = req.body as { name: string; phone: string };
  if (!phone) {
    res.status(400).json({ error: 'Missing "phone"' });
    return;
  }
  try {
    const candidateName = name?.trim() || 'Test Candidate';
    const callId = await initiateWhatsAppCall(phone, candidateName, 'manual');
    res.json({ success: true, callId });
  } catch (err) {
    console.error('[wa] Failed to initiate manual call:', err);
    res.status(500).json({ success: false, error: String(err) });
  }
});

// ── end WhatsApp routes ────────────────────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/media-stream' });
wss.on('connection', (ws) => {
  console.log('[server] New call WebSocket connected');
  new CallHandler(ws);
});

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, async () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] POST http://localhost:${PORT}/call to trigger an outbound call`);
  await initPromptConfig();
  console.log('[server] Prompt config loaded from database');
});
