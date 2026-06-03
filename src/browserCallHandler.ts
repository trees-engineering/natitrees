import WebSocket from 'ws';
import { DeepgramBrowserSTT } from './providers/stt/deepgramBrowser';
import { createBrowserTTS, BrowserTTSProvider } from './tts';
import { createLLM, getMYTDateTime, LLMProvider } from './llm';
import { SessionStore } from './interview/sessionStore';

interface StartMessage { type: 'start'; candidateName?: string; talentId?: string; }
interface EndMessage   { type: 'end'; }
type ControlMessage = StartMessage | EndMessage;

export class BrowserCallHandler {
  private ws: WebSocket;
  private stt: DeepgramBrowserSTT;
  private tts: BrowserTTSProvider;
  private llm: LLMProvider | null = null;
  private candidateName = 'there';
  private isReturning = false;
  private session: SessionStore | null = null;
  private agentSpeaking = false;
  private ttsAborted = false;
  private lastInterruptTime = 0;
  private sttStart = 0;
  private pendingUtterance: string | null = null;
  private ended = false;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.stt = new DeepgramBrowserSTT();
    this.tts = createBrowserTTS();

    this.stt.onTranscript((text) => this.handleUserSpeech(text));
    this.stt.onInterimTranscript((text) => {
      if (this.agentSpeaking && text.trim()) this.interruptAgent();
    });
    this.stt.onSpeechStart(() => {
      if (this.agentSpeaking) this.interruptAgent();
    });

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        this.stt.sendAudio(data);
      } else {
        try {
          const msg = JSON.parse(data.toString()) as ControlMessage;
          if (msg.type === 'start') {
            void this.initSession(msg);
          } else if (msg.type === 'end') {
            this.handleEnd();
          }
        } catch {}
      }
    });

    ws.on('close', () => this.handleEnd());
    ws.on('error', (err) => console.error('[browser-voice] WS error:', err));
  }

  private async initSession(msg: StartMessage): Promise<void> {
    if (msg.talentId) {
      this.session = new SessionStore(msg.talentId);
      try {
        await this.session.load();
        this.candidateName = this.session.getCandidateName();
        // isReturning: true if a previous call summary exists in the profile
        const ctx = this.session.getProfileContext();
        this.isReturning = !!ctx['Previous call summary'];
        console.log(`[browser-voice] Loaded profile for ${this.candidateName} (returning=${this.isReturning})`);
      } catch (err) {
        console.error('[browser-voice] Failed to load profile:', err);
        this.candidateName = msg.candidateName?.trim() || 'there';
      }
    } else {
      this.candidateName = msg.candidateName?.trim() || 'there';
    }
    void this.agentSpeakFirst();
  }

  private sendJson(msg: object): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendAudio(buffer: Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
  }

  private interruptAgent(): void {
    const now = Date.now();
    if (now - this.lastInterruptTime < 500) return;
    this.ttsAborted = true;
    this.lastInterruptTime = now;
    this.sttStart = Date.now();
    this.sendJson({ type: 'clear' });
    console.log('[browser-voice] Agent interrupted');
  }

  private async agentSpeakFirst(): Promise<void> {
    const greeting = this.isReturning
      ? `Hey ${this.candidateName}, it's Treelance again from Trees OS. Good to speak with you. Is now a good time?`
      : `Hey ${this.candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better. Is now an okay time?`;

    this.agentSpeaking = true;
    this.ttsAborted = false;
    try {
      const sentences = greeting.match(/[^.!?]+[.!?]+/g) ?? [greeting];
      for (const sentence of sentences) {
        if (this.ttsAborted || this.ended) break;
        await this.synthesizeAndSend(sentence.trim());
      }
    } finally {
      this.agentSpeaking = false;
    }

    const profileData = this.session?.getProfileContext() ?? {};
    this.llm = createLLM(this.candidateName, profileData, getMYTDateTime());
    this.llm.addMessage('assistant', greeting);
    this.sendJson({ type: 'agent', text: greeting });

    if (this.pendingUtterance) {
      const pending = this.pendingUtterance;
      this.pendingUtterance = null;
      await this.handleUserSpeech(pending);
    }
  }

  private async synthesizeAndSend(text: string): Promise<void> {
    if (this.ttsAborted || this.ended) return;
    try {
      const audio = await this.tts.synthesize(text);
      if (this.ttsAborted || this.ended) return;
      this.sendAudio(audio);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.error('[browser-voice] TTS error:', err);
      }
    }
  }

  private async handleUserSpeech(text: string): Promise<void> {
    if (!text.trim() || this.ended) return;

    if (this.agentSpeaking) {
      this.pendingUtterance = text;
      return;
    }
    if (!this.llm) return;

    const sttMs = this.sttStart > 0 ? Date.now() - this.sttStart : 0;
    this.sttStart = 0;
    this.ttsAborted = false;

    console.log(`[browser-voice] User: ${text}`);
    this.sendJson({ type: 'transcript', text });
    this.llm.addMessage('user', text);

    const llmStart = Date.now();
    let fullResponse = '';
    let buffer = '';
    let firstSentenceMs = 0;

    this.agentSpeaking = true;
    try {
      for await (const chunk of this.llm.respondStream()) {
        buffer += chunk;
        fullResponse += chunk;

        const { complete, remainder } = this.extractSentences(buffer);
        buffer = remainder;

        for (const sentence of complete) {
          if (firstSentenceMs === 0) firstSentenceMs = Date.now() - llmStart;
          await this.synthesizeAndSend(sentence);
          if (this.ttsAborted) break;
        }
        if (this.ttsAborted) break;
      }

      if (!this.ttsAborted && buffer.trim()) {
        const clean = buffer.replace('[END_CALL]', '').trim();
        if (clean) await this.synthesizeAndSend(clean);
      }
    } catch (err) {
      console.error('[browser-voice] LLM error:', err);
      await this.synthesizeAndSend("Sorry, I missed that — could you say it again?");
      fullResponse = "Sorry, I missed that — could you say it again?";
    } finally {
      this.agentSpeaking = false;
    }

    const cleanResponse = fullResponse.replace('[END_CALL]', '').trim();
    if (cleanResponse) {
      this.llm.addMessage('assistant', cleanResponse);
      this.sendJson({ type: 'agent', text: cleanResponse });
      console.log(`[browser-voice] Agent: ${cleanResponse}`);
      console.log(`[browser-voice] Latency — STT: ${sttMs}ms | LLM→1st sentence: ${firstSentenceMs}ms`);

      if (fullResponse.includes('[END_CALL]')) {
        this.sendJson({ type: 'session_end' });
      }
    }

    if (this.pendingUtterance) {
      const pending = this.pendingUtterance;
      this.pendingUtterance = null;
      await this.handleUserSpeech(pending);
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

  private handleEnd(): void {
    if (this.ended) return;
    this.ended = true;
    this.ttsAborted = true;
    this.stt.close();
    console.log('[browser-voice] Session ended');
  }
}
