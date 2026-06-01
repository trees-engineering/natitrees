// eslint-disable-next-line @typescript-eslint/no-require-imports
const wrtc = require('@roamhq/wrtc');
const { RTCPeerConnection, RTCSessionDescription, nonstandard } = wrtc;
const { RTCAudioSource, RTCAudioSink } = nonstandard;

import { createLLM, getMYTDateTime, LLMProvider } from '../llm';
import { createTTS, TTSProvider } from '../tts';
import { getCallMeta, removeCall, getGreetingAudio, clearGreetingAudio } from '../callStore';
import { SessionStore } from '../interview/sessionStore';
import { sendSdpAnswer, endWaCall } from './graphApi';
import { WhatsAppDeepgramSTT } from './stt';

// Convert mulaw 8kHz (TTS output) → linear16 for RTCAudioSource
function mulawBufToLinear16(buf: Buffer): Int16Array {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    let u = ~buf[i] & 0xff;
    const sign = u & 0x80;
    const exp = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    const value = (((mantissa << 1) + 33) << exp) - 33;
    out[i] = sign ? -value : value;
  }
  return out;
}

const activeWaCalls = new Map<string, WhatsAppCallHandler>();

export function getWaHandler(callId: string): WhatsAppCallHandler | undefined {
  return activeWaCalls.get(callId);
}

export class WhatsAppCallHandler {
  private callId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pc: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private audioSource: any;
  private stt: WhatsAppDeepgramSTT;
  private llm: LLMProvider | null = null;
  private tts: TTSProvider;
  private callEnded = false;
  private agentSpeaking = false;
  private interrupted = false;
  private sttStart = 0;
  private agentSpeakingStart = 0;
  private lastInterruptTime = 0;
  private ttsAbortController: AbortController | null = null;
  private pendingUtterance: string | null = null;
  private callEndTimer: ReturnType<typeof setTimeout> | null = null;
  private callEndAborted = false;
  private candidateName = 'there';
  private session: SessionStore | null = null;
  private sessionReady: Promise<void> = Promise.resolve();

  constructor(callId: string, sdpOffer: string) {
    this.callId = callId;
    activeWaCalls.set(callId, this);

    this.audioSource = new RTCAudioSource();
    this.tts = createTTS();

    this.stt = new WhatsAppDeepgramSTT();
    this.stt.onTranscript((text) => this.handleCandidateSpeech(text));
    this.stt.onInterimTranscript((text) => {
      console.log(`[wa-interim] ${text}`);
      if (this.agentSpeaking && text.trim()) this.interruptAgent();
    });
    this.stt.onSpeechStart(() => {
      if (!this.agentSpeaking && this.sttStart === 0) this.sttStart = Date.now();
      if (this.agentSpeaking) this.interruptAgent();
    });

    const meta = getCallMeta(callId);
    if (meta) {
      this.candidateName = meta.candidateName || 'there';
      if (meta.talentId !== 'manual') {
        this.session = new SessionStore(meta.talentId);
        this.sessionReady = this.session.load().catch((err) =>
          console.error('[wa] Session load failed:', err),
        );
      }
    }

    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const outgoingTrack = this.audioSource.createTrack();
    this.pc.addTrack(outgoingTrack);

    this.pc.ontrack = (event: { track: { kind: string } }) => {
      const { track } = event;
      if (track.kind !== 'audio') return;
      const sink = new RTCAudioSink(track);
      sink.ondata = ({ samples }: { samples: Int16Array }) => {
        this.stt.sendAudio(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));
      };
    };

    void this.setupWebRTC(sdpOffer);
  }

  private async setupWebRTC(sdpOffer: string): Promise<void> {
    try {
      await this.pc.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: sdpOffer }),
      );
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering to complete, with 5s fallback
      await new Promise<void>((resolve) => {
        if (this.pc.iceGatheringState === 'complete') { resolve(); return; }
        const timeout = setTimeout(resolve, 5000);
        this.pc.onicegatheringstatechange = () => {
          if (this.pc.iceGatheringState === 'complete') {
            clearTimeout(timeout);
            resolve();
          }
        };
      });

      const sdp = this.pc.localDescription?.sdp;
      if (!sdp) throw new Error('No local SDP after ICE gathering');

      await sendSdpAnswer(this.callId, sdp);
      console.log(`[wa] WebRTC ready — callId: ${this.callId}`);
      void this.agentSpeakFirst();
    } catch (err) {
      console.error('[wa] WebRTC setup failed:', err);
      this.end();
    }
  }

  private interruptAgent(): void {
    const now = Date.now();
    if (now - this.lastInterruptTime < 1000) return;
    if (now - this.agentSpeakingStart < 200) return;

    this.interrupted = true;
    this.lastInterruptTime = now;
    this.sttStart = Date.now();
    this.ttsAbortController?.abort();
    console.log('[wa-barge-in] Agent interrupted');
  }

  private async agentSpeakFirst(): Promise<void> {
    const greeting = `Hey ${this.candidateName}, this is Treelance from Trees OS — just so you know, you're speaking with an AI. This is just a quick, relaxed chat to get to know you a bit better. Is now an okay time?`;

    this.agentSpeaking = true;
    this.agentSpeakingStart = Date.now();
    try {
      const preGenChunks = getGreetingAudio(this.callId);
      if (preGenChunks) {
        clearGreetingAudio(this.callId);
        console.log('[wa-greeting] Playing pre-generated audio');
        for (const chunk of preGenChunks) {
          if (this.interrupted) break;
          this.sendAudioToCandidate(chunk);
        }
      } else {
        console.log('[wa-greeting] Using real-time TTS');
        const sentences = greeting.match(/[^.!?]+[.!?]+/g) ?? [greeting];
        for (const sentence of sentences) {
          if (this.interrupted) break;
          await this.streamToCandidate(sentence.trim());
        }
      }

      await this.sessionReady;
      const profileData = this.session?.getProfileContext() ?? {};
      console.log(`[wa-llm] Building prompt for ${this.candidateName}`);
      this.llm = createLLM(this.candidateName, profileData, getMYTDateTime());
      this.llm.addMessage('assistant', greeting);
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

    console.log(`[wa-candidate] ${text}`);
    this.llm.addMessage('user', text);

    const llmStart = Date.now();
    let firstSentenceMs = 0;
    let ttsFirstChunkMs = 0;
    let fullResponse = '';
    let buffer = '';
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
          const chunkMs = await this.streamToCandidate(sentence);
          if (ttsFirstChunkMs === 0) ttsFirstChunkMs = chunkMs;
          if (this.interrupted) break;
        }
        if (this.interrupted) break;
      }

      endCallSignal = fullResponse.includes('[END_CALL]');
      if (!this.interrupted && buffer.trim()) {
        const clean = buffer.replace('[END_CALL]', '').trim();
        if (clean) {
          const chunkMs = await this.streamToCandidate(clean);
          if (ttsFirstChunkMs === 0) ttsFirstChunkMs = chunkMs;
        }
      }
    } catch (err) {
      console.error('[wa-llm] Error:', err);
      await this.streamToCandidate("Sorry, I missed that. Could you say it again?");
      fullResponse = "Sorry, I missed that. Could you say it again?";
    } finally {
      this.agentSpeaking = false;
    }

    const cleanResponse = fullResponse.replace('[END_CALL]', '').trim();
    if (cleanResponse && !this.interrupted) {
      this.llm.addMessage('assistant', cleanResponse);
      console.log(`[wa-agent] ${cleanResponse}`);
      const e2e = sttMs + firstSentenceMs + ttsFirstChunkMs;
      console.log(`[wa-latency] STT: ${sttMs}ms | LLM: ${firstSentenceMs}ms | TTS: ${ttsFirstChunkMs}ms | E2E: ${e2e}ms`);
      if (endCallSignal) this.scheduleCallEnd();
    } else if (cleanResponse && this.interrupted) {
      console.log(`[wa-agent] (interrupted) ${cleanResponse}`);
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

  private async streamToCandidate(text: string): Promise<number> {
    this.ttsAbortController = new AbortController();
    const { signal } = this.ttsAbortController;
    const start = Date.now();
    let firstChunkMs = 0;
    try {
      for await (const chunk of this.tts.stream(text, signal)) {
        if (firstChunkMs === 0) firstChunkMs = Date.now() - start;
        if (this.interrupted) break;
        this.sendAudioToCandidate(chunk);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        console.error('[wa-tts] Error:', err);
      }
    }
    return firstChunkMs;
  }

  // TTS outputs mulaw 8kHz — convert to linear16 and push into WebRTC audio source
  private sendAudioToCandidate(mulawChunk: Buffer): void {
    const pcm16 = mulawBufToLinear16(mulawChunk);
    this.audioSource.onData({
      samples: pcm16,
      sampleRate: 8000,
      bitsPerSample: 16,
      channelCount: 1,
      numberOfFrames: pcm16.length,
    });
  }

  private scheduleCallEnd(): void {
    this.callEndAborted = false;
    this.callEndTimer = setTimeout(async () => {
      this.callEndTimer = null;
      if (this.callEndAborted || this.interrupted) return;

      this.agentSpeaking = true;
      this.agentSpeakingStart = Date.now();
      this.interrupted = false;
      try {
        await this.streamToCandidate('The call will end shortly.');
      } finally {
        this.agentSpeaking = false;
      }

      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (this.callEndAborted) return;
      }

      try {
        await endWaCall(this.callId);
      } catch (err) {
        console.error('[wa] Failed to end call:', err);
      }
    }, 4000);
  }

  end(): void {
    if (this.callEnded) return;
    this.callEnded = true;
    console.log('[wa] Call ended');
    const history = this.llm?.getHistory() ?? [];
    history.forEach((m) => console.log(`  [${m.role}] ${m.content}`));
    this.stt.close();
    this.pc.close();
    activeWaCalls.delete(this.callId);
    if (this.session) {
      void this.session.save(history);
      removeCall(this.callId);
    }
  }
}
