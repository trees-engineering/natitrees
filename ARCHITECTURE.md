# AI Voice Agent — Full Architecture Document

**Project:** Treelance AI Voice Agent  
**Last Updated:** May 2026  
**Stack:** TypeScript (Node.js)

---

## 1. Full Custom Architecture

```
TRIGGER
POST /call { to, candidateName }
        │
        ▼
┌─────────────────────────────────────────────────────────┐
│                    LAYER 1 — TELEPHONY                   │
│                                                          │
│                    Twilio (outbound)                     │
│            makes call → candidate picks up               │
└─────────────────────────┬───────────────────────────────┘
                          │ WebSocket audio stream
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  LAYER 2 — CORE PIPELINE                 │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              callHandler.ts                      │    │
│  │                                                  │    │
│  │  Twilio audio                                    │    │
│  │       │                                          │    │
│  │       ▼                                          │    │
│  │  STT middleman (stt.ts)                          │    │
│  │       └── Deepgram (providers/stt/deepgram.ts)   │    │
│  │                │                                 │    │
│  │           transcript                             │    │
│  │                │                                 │    │
│  │                ▼                                 │    │
│  │  LLM middleman (llm.ts)                          │    │
│  │       └── Gemini (providers/llm/gemini.ts)       │    │
│  │                │                                 │    │
│  │           response text                          │    │
│  │                │                                 │    │
│  │                ▼                                 │    │
│  │  TTS middleman (tts.ts)                          │    │
│  │       └── ElevenLabs (providers/tts/elevenlabs)  │    │
│  │                │                                 │    │
│  │           mulaw audio                            │    │
│  │                │                                 │    │
│  │       back to Twilio → candidate's ear           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │ call ends
                          ▼
┌─────────────────────────────────────────────────────────┐
│               LAYER 3 — TOOL CALLS (Phase 2)             │
│                                                          │
│  src/tools/                                              │
│  ├── calendar.ts        book follow-up interviews        │
│  ├── candidateLookup.ts check candidate in DB            │
│  └── escalation.ts      hand off to human recruiter      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              LAYER 4 — SESSION MEMORY (Phase 3)          │
│                                                          │
│  Redis                                                   │
│  ├── conversation history per call                       │
│  ├── candidate state                                     │
│  └── call metadata                                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│           LAYER 5 — POST-PROCESSING (Phase 4)            │
│                                                          │
│  transcript                                              │
│       ├── cleanup (punctuation, disfluency)              │
│       ├── entity extraction (skills, experience)         │
│       ├── sentiment & tone analysis                      │
│       └── AI summary for recruiter                       │
│                    │                                     │
│                    ▼                                     │
│              PostgreSQL (candidate DB)                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│           LAYER 6 — RECRUITER DASHBOARD (Phase 5)        │
│                                                          │
│  candidate list │ profile │ transcript │ sentiment       │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Component | Technology | Status |
|-----------|-----------|--------|
| Language | TypeScript (Node.js) | Done |
| Telephony | Twilio (outbound calls) | Done |
| STT | Deepgram Nova-2 | Done |
| LLM | Gemini 2.5 Flash | Done |
| TTS | ElevenLabs Turbo v2.5 | Done |
| Audio conversion | FFmpeg (via ffmpeg-static) | Done |
| Provider switching | Middleman pattern (.env) | Done |
| Tool calls | Gemini function calling | Phase 2 |
| Session memory | Redis | Phase 3 |
| Candidate database | PostgreSQL | Phase 4 |
| Post-processing | Gemini batch | Phase 4 |
| Dashboard | Next.js or Streamlit | Phase 5 |

---

## 3. Build Order (Phases)

### Phase 1 — Core Call Pipeline (DONE)
- Outbound call via Twilio
- Real-time STT via Deepgram
- LLM conversation via Gemini
- TTS voice via ElevenLabs
- Full live conversation loop
- Provider middleman pattern for easy switching

### Phase 2 — Tool Calls (Next)
- Give the agent real abilities during the call
- Check candidate in database before responding
- Book a calendar slot for follow-up interview
- Escalate to human recruiter if needed
- Tech: Gemini function calling + src/tools/

### Phase 3 — Session Memory
- Persist conversation state across turns
- Track candidate progress through interview stages
- Store call metadata (duration, timestamps)
- Tech: Redis

### Phase 4 — Post-Call Processing
- Automatically run after every call ends
- Transcript cleanup (punctuation, disfluency removal)
- Entity extraction (skills, experience, intent signals)
- Sentiment and tone analysis
- AI summary generation for recruiters
- Store enriched profile in candidate database
- Tech: Gemini batch + PostgreSQL

### Phase 5 — Recruiter Dashboard
- View all candidates and their status
- Read full call transcripts
- See AI-generated summaries and sentiment flags
- Shortlist candidates for human follow-up
- Tech: Next.js or Streamlit

---

## 4. Current Folder Structure

```
voice-agent/
├── src/
│   ├── index.ts                  server entry point
│   ├── callController.ts         triggers outbound calls
│   ├── callHandler.ts            orchestrates each call
│   ├── llm.ts                    LLM middleman
│   ├── stt.ts                    STT middleman
│   ├── tts.ts                    TTS middleman
│   └── providers/
│       ├── llm/
│       │   └── gemini.ts         Gemini implementation
│       ├── stt/
│       │   └── deepgram.ts       Deepgram implementation
│       └── tts/
│           └── elevenlabs.ts     ElevenLabs implementation
├── .env                          API keys (never commit)
├── .env.example                  template
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Provider Switching

To switch any provider, change one line in `.env` and restart the server:

```
LLM_PROVIDER=gemini       # options: gemini, openai, claude
STT_PROVIDER=deepgram     # options: deepgram, assemblyai
TTS_PROVIDER=elevenlabs   # options: elevenlabs, deepgram
```

To add a new provider:
1. Create the file in `src/providers/llm/`, `src/providers/stt/`, or `src/providers/tts/`
2. Add one case to the switch in the relevant middleman file
3. Change `.env`

No other files need to change.

---

## 6. Audio Pipeline

```
Candidate speaks
      │
      │ mulaw 8kHz (Twilio format)
      ▼
Deepgram STT (accepts mulaw 8kHz natively — no conversion)
      │
      │ text transcript
      ▼
Gemini LLM
      │
      │ response text
      ▼
ElevenLabs TTS (outputs MP3)
      │
      │ MP3
      ▼
FFmpeg (converts MP3 → mulaw 8kHz)
      │
      │ mulaw 8kHz
      ▼
Twilio → candidate's ear
```
