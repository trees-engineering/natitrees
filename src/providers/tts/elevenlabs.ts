import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { TTSProvider } from '../../tts';

export class ElevenLabsTTS implements TTSProvider {
  private apiKey: string;
  private voiceId: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY!;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL';
  }

  async *stream(text: string, _signal?: AbortSignal): AsyncGenerator<Buffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          output_format: 'mp3_44100_64',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`ElevenLabs error ${response.status}: ${err}`);
    }

    if (!response.body) throw new Error('No response body from ElevenLabs');

    const ffmpeg = spawn(ffmpegPath as string, [
      '-i', 'pipe:0',
      '-ar', '8000',
      '-ac', '1',
      '-acodec', 'pcm_mulaw',
      '-f', 'mulaw',
      'pipe:1',
    ]);

    ffmpeg.stderr.on('data', () => {});

    const reader = response.body.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { ffmpeg.stdin.end(); break; }
          ffmpeg.stdin.write(value);
        }
      } catch {
        ffmpeg.stdin.end();
      }
    })();

    for await (const chunk of ffmpeg.stdout) {
      yield chunk as Buffer;
    }
  }
}
