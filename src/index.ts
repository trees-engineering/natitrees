import 'dotenv/config';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { CallHandler } from './callHandler';
import { initiateCall } from './callController';
import { loadProfile } from './interview/profileLoader';
import { registerDashboardRoutes } from './dashboardRoutes';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Dashboard — served at /dashboard, API at /api/dashboard/*
registerDashboardRoutes(app);
app.use('/dashboard', express.static(path.join(__dirname, '../dashboard')));

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
const wss = new WebSocketServer({ server, path: '/media-stream' });

wss.on('connection', (ws) => {
  console.log('[server] New call WebSocket connected');
  new CallHandler(ws);
});

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
  console.log(`[server] POST http://localhost:${PORT}/call to trigger an outbound call`);
});
