import 'dotenv/config';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { CallHandler } from './callHandler';
import { BrowserCallHandler } from './browserCallHandler';
import { initiateCall, endCall } from './callController';
import { removeCall } from './callStore';
import { loadProfile } from './interview/profileLoader';
import { registerDashboardRoutes } from './dashboardRoutes';
import { initPromptConfig } from './promptConfig';

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

// Twilio posts here when a call ends without ever connecting (failed, busy, no-answer, canceled).
// Cleans up the call store so the talent isn't locked as "in progress".
app.post('/call-status', (req, res) => {
  const { CallSid, CallStatus } = req.body as { CallSid: string; CallStatus: string };
  res.sendStatus(204);
  console.log(`[call-status] ${CallSid} → ${CallStatus}`);
  removeCall(CallSid);
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

const server = createServer(app);

// noServer mode so we can route upgrade events by path manually —
// attaching two WebSocketServers with `path` to the same HTTP server conflicts.
const wss = new WebSocketServer({ noServer: true });
wss.on('connection', (ws) => {
  console.log('[server] New call WebSocket connected');
  new CallHandler(ws);
});

const browserWss = new WebSocketServer({ noServer: true });
browserWss.on('connection', (ws) => {
  console.log('[server] New browser voice session connected');
  new BrowserCallHandler(ws);
});

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
  if (pathname === '/media-stream') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname === '/browser-voice') {
    browserWss.handleUpgrade(req, socket, head, (ws) => browserWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, async () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] POST http://localhost:${PORT}/call to trigger an outbound call`);
  await initPromptConfig();
  console.log('[server] Prompt config loaded from database');
});
