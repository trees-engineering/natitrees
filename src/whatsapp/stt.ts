import WebSocket from 'ws';

type TranscriptCb = (text: string) => void;
type SpeechCb = () => void;

// Same as DeepgramSTT but uses linear16 encoding instead of mulaw.
// WebRTC delivers audio as linear16 PCM (Int16Array), not mulaw.
// sample_rate=48000 matches the standard Opus/WebRTC codec rate.
const DEEPGRAM_WA_URL =
  'wss://api.deepgram.com/v2/listen?' +
  'encoding=linear16&sample_rate=48000&channels=1' +
  '&model=flux-general-multi' +
  '&eot_timeout_ms=1500';

export class WhatsAppDeepgramSTT {
  private ws: WebSocket;
  private onTranscriptCb: TranscriptCb = () => {};
  private onInterimCb: TranscriptCb = () => {};
  private onSpeechStartCb: SpeechCb = () => {};
  private closing = false;

  constructor() {
    this.ws = this.connect();
  }

  private connect(): WebSocket {
    const ws = new WebSocket(DEEPGRAM_WA_URL, {
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
    });

    ws.on('open', () => console.log('[wa-stt] Deepgram connected'));

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== 'TurnInfo') return;

        const transcript: string = msg.transcript ?? '';

        if (msg.event === 'StartOfTurn') {
          this.onSpeechStartCb();
          return;
        }
        if (msg.event === 'EndOfTurn' && transcript) {
          this.onTranscriptCb(transcript);
          return;
        }
        if (msg.event === 'Update' && transcript) {
          this.onInterimCb(transcript);
        }
      } catch { /* ignore non-JSON */ }
    });

    ws.on('error', (err) => console.error('[wa-stt] Deepgram error:', err.message));

    ws.on('close', (code) => {
      console.warn(`[wa-stt] Deepgram closed — code: ${code}`);
      if (!this.closing) {
        setTimeout(() => { this.ws = this.connect(); }, 1000);
      }
    });

    return ws;
  }

  sendAudio(chunk: Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(chunk);
  }

  onTranscript(cb: TranscriptCb): void { this.onTranscriptCb = cb; }
  onInterimTranscript(cb: TranscriptCb): void { this.onInterimCb = cb; }
  onSpeechStart(cb: SpeechCb): void { this.onSpeechStartCb = cb; }

  close(): void {
    this.closing = true;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    }
    this.ws.close();
  }
}
