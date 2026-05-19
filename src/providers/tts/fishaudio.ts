import { TTSProvider } from '../../tts';
import { encode } from '@msgpack/msgpack';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

export class FishAudioTTS implements TTSProvider {
  private apiKey: string;
  private voiceId: string;

  constructor() {
    this.apiKey = process.env.FISH_AUDIO_API_KEY!;
    this.voiceId = process.env.FISH_AUDIO_VOICE_ID!;
  }

  async *stream(text: string, signal?: AbortSignal): AsyncGenerator<Buffer> {
    const body = encode({
      text,
      reference_id: this.voiceId,
      format: 'pcm',
      chunk_length: 200,
      latency: 'balanced',
    });

    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/msgpack',
        'model': 's2-pro',
      },
      body,
    });

    if (signal?.aborted) return;

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Fish Audio error ${response.status}: ${err}`);
    }

    if (!response.body) throw new Error('No response body from Fish Audio');

    // Fish Speech outputs PCM s16le at 44100Hz — transcode to mulaw 8kHz for Twilio
    const ffmpeg = spawn(ffmpegPath!, [
      '-f', 's16le', '-ar', '44100', '-ac', '1',
      '-i', 'pipe:0',
      '-f', 'mulaw', '-ar', '8000', '-ac', '1',
      'pipe:1',
    ]);

    const reader = response.body.getReader();

    void (async () => {
      try {
        while (true) {
          if (signal?.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;
          ffmpeg.stdin.write(value);
        }
      } catch {
        // ignore
      } finally {
        ffmpeg.stdin.end();
      }
    })();

    signal?.addEventListener('abort', () => ffmpeg.kill());

    for await (const chunk of ffmpeg.stdout) {
      if (signal?.aborted) break;
      yield chunk as Buffer;
    }
  }
}
