import WebSocket from 'ws';
import { STTProvider } from '../../stt';

const DEEPGRAM_URL =
  'wss://api.deepgram.com/v2/listen?' +
  'encoding=mulaw&sample_rate=8000' +
  '&model=flux-general-multi' +
  '&eot_timeout_ms=1500';

export class DeepgramSTT implements STTProvider {
  private ws: WebSocket;
  private onTranscriptCallback: ((text: string) => void) | null = null;
  private onInterimTranscriptCallback: ((text: string) => void) | null = null;
  private onSpeechStartCallback: (() => void) | null = null;
  private interimBuffer = '';
  private closing = false;

  constructor() {
    this.ws = this.connect();
  }

  private connect(): WebSocket {
    const ws = new WebSocket(DEEPGRAM_URL, {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    });

    ws.on('open', () => {
      console.log('[stt] Deepgram connected');
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== 'TurnInfo') return;

        const transcript: string = msg.transcript ?? '';

        if (msg.event === 'StartOfTurn') {
          console.log('[stt] SpeechStarted');
          this.onSpeechStartCallback?.();
          return;
        }

        if (msg.event === 'EndOfTurn') {
          if (transcript) this.onTranscriptCallback?.(transcript);
          return;
        }

        if (msg.event === 'Update' && transcript) {
          this.interimBuffer = transcript;
          this.onInterimTranscriptCallback?.(transcript);
        }
      } catch {
        // ignore non-JSON messages
      }
    });

    ws.on('error', (err) => {
      console.error('[stt] Deepgram error:', err.message);
    });

    ws.on('close', (code) => {
      console.warn(`[stt] Deepgram closed — code: ${code}`);
      if (!this.closing) {
        console.log('[stt] Reconnecting to Deepgram in 1s...');
        setTimeout(() => {
          this.ws = this.connect();
        }, 1000);
      }
    });

    return ws;
  }

  sendAudio(chunk: Buffer): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    }
  }

  onTranscript(callback: (text: string) => void): void {
    this.onTranscriptCallback = callback;
  }

  onInterimTranscript(callback: (text: string) => void): void {
    this.onInterimTranscriptCallback = callback;
  }

  onSpeechStart(callback: () => void): void {
    this.onSpeechStartCallback = callback;
  }

  close(): void {
    this.closing = true;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    }
    this.ws.close();
  }
}
