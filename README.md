# Voice Agent — Phase 1: Core Call Pipeline

## What this does
Outbound AI voice agent. You POST a candidate's phone number → agent calls them → live conversation via Claude + ElevenLabs + Deepgram.

---

## Setup (one-time)

### 1. Install dependencies
```
cd voice-agent
npm install
```

### 2. Create your .env file
```
cp .env.example .env
```
Fill in all 4 API keys (see below).

### 3. Get API keys

| Service | Where | Notes |
|---------|-------|-------|
| Twilio | twilio.com | Free trial gives ~$15 credit. Get Account SID, Auth Token, and a phone number |
| Deepgram | console.deepgram.com | $200 free credit |
| Anthropic | console.anthropic.com | Pay as you go |
| ElevenLabs | elevenlabs.io | Free tier: 10k chars/month |

### 4. Install ngrok (exposes your local server to Twilio)
Download from ngrok.com and sign up for a free account.

---

## Running it

### Terminal 1 — Start the server
```
npm run dev
```

### Terminal 2 — Start ngrok
```
ngrok http 3000
```
Copy the `https://xxxx.ngrok-free.app` URL from ngrok output.

### Update .env with your ngrok URL
```
PUBLIC_HTTP_URL=https://xxxx.ngrok-free.app
PUBLIC_WS_URL=wss://xxxx.ngrok-free.app/media-stream
```
Restart the server after changing .env.

---

## Making a call

```bash
curl -X POST http://localhost:3000/call \
  -H "Content-Type: application/json" \
  -d '{"to": "+447xxxxxxxxx", "candidateName": "John Smith"}'
```

The agent will call John Smith's number. When they pick up, the conversation starts automatically.

---

## Project structure

```
src/
  index.ts          # Server entry point, routes
  callController.ts # Triggers outbound Twilio call
  callHandler.ts    # WebSocket handler — orchestrates the call
  stt.ts            # Deepgram real-time speech-to-text
  llm.ts            # Claude — conversation brain
  tts.ts            # ElevenLabs — text to speech
```

---

## Audio format (no conversion needed)
- Twilio streams: mulaw 8kHz
- Deepgram configured to receive: mulaw 8kHz  
- ElevenLabs outputs: ulaw_8000  
- Twilio receives back: ulaw_8000  
All match — zero conversion overhead.

---

## Next phases
- Phase 2: Tool calls (calendar booking, DB lookup, escalation to human)
- Phase 3: Redis session memory across turns
- Phase 4: Post-call enrichment (entity extraction, sentiment, summary)
- Phase 5: Recruiter dashboard
