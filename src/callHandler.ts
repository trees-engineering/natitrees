import WebSocket from 'ws';
import { createSTT, STTProvider } from './stt';
import { createLLM, LLMProvider } from './llm';
import { createTTS, TTSProvider } from './tts';
import { getCallMeta, removeCall } from './callStore';
import { endCall } from './callController';
import { SessionStore } from './interview/sessionStore';

interface TwilioStartEvent {
  event: 'start';
  start: { streamSid: string; callSid: string };
}
interface TwilioMediaEvent {
  event: 'media';
  media: { payload: string; chunk: string; timestamp: string };
}
interface TwilioStopEvent {
  event: 'stop';
}
type TwilioMessage = TwilioStartEvent | TwilioMediaEvent | TwilioStopEvent;

export class CallHandler {
  private ws: WebSocket;
  private streamSid = '';
  private stt: STTProvider;
  private llm: LLMProvider | null = null;
  private tts: TTSProvider;
  private agentSpeaking = false;
  private interrupted = false;
  private sttStart = 0;
  private agentSpeakingStart = 0;
  private lastInterruptTime = 0;
  private ttsAbortController: AbortController | null = null;
  private pendingUtterance: string | null = null;
  private callEnded = false;
  private callSid = '';
  private session: SessionStore | null = null;
  private sessionReady: Promise<void> = Promise.resolve();
  private callEndTimer: ReturnType<typeof setTimeout> | null = null;
  private callEndAborted = false;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.stt = createSTT();
    this.tts = createTTS();

    this.stt.onTranscript((text) => this.handleCandidateSpeech(text));
    this.stt.onInterimTranscript((text) => console.log(`[interim] ${text}`));

    this.stt.onSpeechStart(() => {
      if (!this.agentSpeaking && this.sttStart === 0) this.sttStart = Date.now();
      if (this.agentSpeaking) {
        this.interruptAgent();
      }
    });

    ws.on('message', (data: Buffer) => this.handleTwilioMessage(data));
    ws.on('close', () => this.handleCallEnd());
    ws.on('error', (err) => console.error('[call] WebSocket error:', err));
  }

  private handleTwilioMessage(data: Buffer): void {
    const msg = JSON.parse(data.toString()) as TwilioMessage;

    if (msg.event === 'start') {
      this.streamSid = msg.start.streamSid;
      this.callSid = msg.start.callSid;
      console.log(`[call] Stream started — SID: ${this.streamSid}`);
      const meta = getCallMeta(this.callSid);
      if (meta) {
        this.session = new SessionStore(meta.talentId);
        this.sessionReady = this.session.load().catch(err =>
          console.error('[call] Session load failed:', err)
        );
      }
      void this.agentSpeakFirst();
    }

    if (msg.event === 'media') {
      const audioChunk = Buffer.from(msg.media.payload, 'base64');
      this.stt.sendAudio(audioChunk);
    }

    if (msg.event === 'stop') {
      this.handleCallEnd();
    }
  }

  private interruptAgent(): void {
    const now = Date.now();
    console.log(`[barge-in] SpeechStarted received — agentSpeaking:${this.agentSpeaking} sinceLastInterrupt:${now - this.lastInterruptTime}ms sinceSpeakStart:${now - this.agentSpeakingStart}ms`);

    if (now - this.lastInterruptTime < 1000) {
      console.log('[barge-in] Skipped — cooldown active');
      return;
    }
    if (now - this.agentSpeakingStart < 1000) {
      console.log('[barge-in] Skipped — agent just started speaking');
      return;
    }

    this.interrupted = true;
    this.lastInterruptTime = now;
    this.sttStart = Date.now();

    this.ttsAbortController?.abort();

    if (this.ws.readyState === WebSocket.OPEN && this.streamSid) {
      this.ws.send(JSON.stringify({ event: 'clear', streamSid: this.streamSid }));
    }
    console.log('[barge-in] Agent interrupted — TTS aborted, Twilio cleared');
  }

  private async agentSpeakFirst(): Promise<void> {
    const openingLine = "Hey, it's Treelance calling.";

    this.agentSpeaking = true;
    this.agentSpeakingStart = Date.now();
    try {
      if (!this.interrupted) await this.streamToTwilio(openingLine);

      await this.sessionReady;
      const candidateName = this.session?.getCandidateName() ?? 'there';
      const headline = this.session?.getHeadline() ?? null;
      const missingFields = this.session?.getMissingFields().map(f => f.label) ?? [];

      const continuation = headline
        ? `I had a look at your profile before calling — great background as a ${headline}. I just wanted to fill in a couple of small gaps so we can match you to the right roles. Have I caught you at an okay time?`
        : `You registered with us for job matching — I just wanted to fill in a couple of small gaps so we can match you properly. Have I caught you at an okay time?`;

      const sentences = continuation.match(/[^.!?]+[.!?]+/g) ?? [continuation];
      for (const sentence of sentences) {
        if (this.interrupted) break;
        await this.streamToTwilio(sentence.trim());
      }

      const fullGreeting = `${openingLine} ${continuation}`;
      console.log(`[llm] Building prompt for ${candidateName} — missing: ${missingFields.join(', ') || 'none'}`);
      this.llm = createLLM(missingFields, candidateName);
      this.llm.addMessage('assistant', fullGreeting);
    } finally {
      this.agentSpeaking = false;
    }

    if (this.pendingUtterance) {
      const pending = this.pendingUtterance;
      this.pendingUtterance = null;
      await this.handleCandidateSpeech(pending);
    }
  }

  private async handleCandidateSpeech(text: string): Promise<void> {
    if (!text.trim()) return;

    if (this.callEndTimer) {
      clearTimeout(this.callEndTimer);
      this.callEndTimer = null;
    }
    this.callEndAborted = true;

    if (this.agentSpeaking) {
      this.pendingUtterance = text;
      return;
    }
    if (!this.llm) return;

    const sttMs = this.sttStart > 0 ? Date.now() - this.sttStart : 0;
    this.sttStart = 0;
    this.interrupted = false;

    console.log(`[candidate] ${text}`);
    this.llm.addMessage('user', text);

    const llmStart = Date.now();
    let firstSentenceMs = 0;
    let fullResponse = '';
    let buffer = '';

    let ttsFirstChunkMs = 0;
    let endCallSignal = false;

    this.agentSpeaking = true;
    this.agentSpeakingStart = Date.now();
    try {
      for await (const chunk of this.llm.respondStream()) {
        buffer += chunk;
        fullResponse += chunk;

        const { complete, remainder } = this.extractSentences(buffer);
        buffer = remainder;

        for (const sentence of complete) {
          if (firstSentenceMs === 0) firstSentenceMs = Date.now() - llmStart;
          const chunkMs = await this.streamToTwilio(sentence);
          if (ttsFirstChunkMs === 0) ttsFirstChunkMs = chunkMs;
          if (this.interrupted) break;
        }

        if (this.interrupted) break;
      }

      endCallSignal = fullResponse.includes('[END_CALL]');
      if (!this.interrupted && buffer.trim()) {
        const cleanBuffer = buffer.replace('[END_CALL]', '').trim();
        if (cleanBuffer) {
          if (firstSentenceMs === 0) firstSentenceMs = Date.now() - llmStart;
          const chunkMs = await this.streamToTwilio(cleanBuffer);
          if (ttsFirstChunkMs === 0) ttsFirstChunkMs = chunkMs;
        }
      }
    } catch (err) {
      console.error('[llm] Error getting response:', err);
      await this.streamToTwilio("Sorry, I missed that. Could you say it again?");
      fullResponse = "Sorry, I missed that. Could you say it again?";
    } finally {
      this.agentSpeaking = false;
    }

    const cleanResponse = fullResponse.replace('[END_CALL]', '').trim();
    if (cleanResponse && !this.interrupted) {
      this.llm.addMessage('assistant', cleanResponse);
      console.log(`[agent] ${cleanResponse}`);
      const e2e = sttMs + firstSentenceMs + ttsFirstChunkMs;
      console.log(`[latency] STT: ${sttMs}ms | LLM→1st sentence: ${firstSentenceMs}ms | TTS→1st chunk: ${ttsFirstChunkMs}ms | E2E: ${e2e}ms`);
      if (endCallSignal) this.scheduleCallEnd();
    } else if (cleanResponse && this.interrupted) {
      console.log(`[agent] (interrupted) ${cleanResponse}`);
    }

    if (this.pendingUtterance) {
      const pending = this.pendingUtterance;
      this.pendingUtterance = null;
      await this.handleCandidateSpeech(pending);
    }
  }

  private extractSentences(text: string): { complete: string[]; remainder: string } {
    const complete: string[] = [];
    const regex = /(.+?[.!?])(?:\s+|$)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      complete.push(match[1].trim());
      lastIndex = match.index + match[0].length;
    }

    return { complete, remainder: text.slice(lastIndex) };
  }

  private async streamToTwilio(text: string): Promise<number> {
    this.ttsAbortController = new AbortController();
    const { signal } = this.ttsAbortController;
    const ttsStart = Date.now();
    let firstChunkMs = 0;
    try {
      for await (const chunk of this.tts.stream(text, signal)) {
        if (firstChunkMs === 0) firstChunkMs = Date.now() - ttsStart;
        if (this.interrupted) break;
        this.sendAudioToTwilio(chunk);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.error('[tts] Error streaming audio:', err);
      }
    }
    return firstChunkMs;
  }

  private sendAudioToTwilio(audioChunk: Buffer): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.streamSid) return;

    this.ws.send(JSON.stringify({
      event: 'media',
      streamSid: this.streamSid,
      media: { payload: audioChunk.toString('base64') },
    }));
  }

  private scheduleCallEnd(): void {
    this.callEndAborted = false;
    this.callEndTimer = setTimeout(async () => {
      this.callEndTimer = null;
      if (this.callEndAborted) return;

      const farewell = "Thank you so much for your time. If there's nothing else you'd like to ask or clarify, this call will end shortly.";
      this.agentSpeaking = true;
      this.agentSpeakingStart = Date.now();
      this.interrupted = false;
      try {
        await this.streamToTwilio(farewell);
      } finally {
        this.agentSpeaking = false;
      }

      if (this.interrupted || this.callEndAborted) {
        if (this.pendingUtterance) {
          const pending = this.pendingUtterance;
          this.pendingUtterance = null;
          await this.handleCandidateSpeech(pending);
        }
        return;
      }

      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (this.callEndAborted) return;
      }

      try {
        await endCall(this.callSid);
      } catch (err) {
        console.error('[call] Failed to end call programmatically:', err);
      }
    }, 7000);
  }

  private handleCallEnd(): void {
    if (this.callEnded) return;
    this.callEnded = true;
    console.log('[call] Call ended');
    const history = this.llm?.getHistory() ?? [];
    history.forEach((m) => console.log(`  [${m.role}] ${m.content}`));
    this.stt.close();
    if (this.session) {
      void this.session.save(history);
      removeCall(this.callSid);
    }
  }
}
