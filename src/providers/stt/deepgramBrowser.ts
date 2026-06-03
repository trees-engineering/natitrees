import WebSocket from 'ws';
import { STTProvider } from '../../stt';

// Browser sends raw Int16 PCM at 48kHz (from AudioWorklet)
const DEEPGRAM_BROWSER_URL =
  'wss://api.deepgram.com/v2/listen?' +
  'encoding=linear16&sample_rate=48000' +
  '&model=flux-general-multi' +
  '&eot_timeout_ms=1200';

export class DeepgramBrowserSTT implements STTProvider {
  private ws: WebSocket;
  private onTranscriptCallback: ((text: string) => void) | null = null;
  private onInterimTranscriptCallback: ((text: string) => void) | null = null;
  private onSpeechStartCallback: (() => void) | null = null;
  private closing = false;

  constructor() {
    this.ws = this.connect();
  }

  private connect(): WebSocket {
    const ws = new WebSocket(DEEPGRAM_BROWSER_URL, {
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
    });

    ws.on('open', () => console.log('[stt-browser] Deepgram connected'));

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== 'TurnInfo') return;
        const transcript: string = msg.transcript ?? '';
        if (msg.event === 'StartOfTurn') {
          this.onSpeechStartCallback?.();
          return;
        }
        if (msg.event === 'EndOfTurn' && transcript) {
          this.onTranscriptCallback?.(transcript);
          return;
        }
        if (msg.event === 'Update' && transcript) {
          this.onInterimTranscriptCallback?.(transcript);
        }
      } catch {
        // ignore non-JSON
      }
    });

    ws.on('error', (err) => console.error('[stt-browser] Deepgram error:', err.message));

    ws.on('close', (code) => {
      if (!this.closing) {
        console.warn(`[stt-browser] Deepgram closed (${code}) — reconnecting in 1s`);
        setTimeout(() => { this.ws = this.connect(); }, 1000);
      }
    });

    return ws;
  }

  sendAudio(chunk: Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(chunk);
  }

  onTranscript(cb: (text: string) => void): void { this.onTranscriptCallback = cb; }
  onInterimTranscript(cb: (text: string) => void): void { this.onInterimTranscriptCallback = cb; }
  onSpeechStart(cb: () => void): void { this.onSpeechStartCallback = cb; }

  close(): void {
    this.closing = true;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    }
    this.ws.close();
  }
}
