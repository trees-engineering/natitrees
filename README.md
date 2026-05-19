# Voice Agent — Phase 1: Core Call Pipeline

## What this does
Outbound AI voice agent. You POST a candidate's phone number → agent calls them → live conversation via Gemini + Cartesia+ Deepgram.





## Project structure

```
src/
  index.ts          # Server entry point, routes
  callController.ts # Triggers outbound Twilio call
  callHandler.ts    # WebSocket handler — orchestrates the call
  stt.ts            # Deepgram real-time speech-to-text
  llm.ts            # Gemini — conversation brain
  tts.ts            # Cartesia — text to speech
```

---


