import { TTSProvider } from '../../tts';

export class CartesiaTTS implements TTSProvider {
  private apiKey: string;
  private voiceId: string;

  constructor() {
    this.apiKey = process.env.CARTESIA_API_KEY!;
    this.voiceId = process.env.CARTESIA_VOICE_ID!;
  }

  private detectLanguage(text: string): 'ms' | 'en' {
    const malay = /\b(saya|anda|tidak|terima kasih|boleh|dengan|untuk|mereka|sekarang|kerja|yang|atau|kepada|ini|itu|macam|lah|kah|hendak|sudah|akan|juga|sangat|ada|perlu)\b/i;
    return malay.test(text) ? 'ms' : 'en';
  }

  async *stream(text: string, signal?: AbortSignal): AsyncGenerator<Buffer> {
    const language = this.detectLanguage(text);
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      signal,
      headers: {
        'X-API-Key': this.apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-3.5',
        transcript: text,
        voice: {
          mode: 'id',
          id: this.voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_mulaw',
          sample_rate: 8000,
        },
        language,
        speed: 0.8,
        __experimental_controls: {
          emotion: ['positivity:high', 'curiosity:medium'],
        },
      }),
    });

    if (signal?.aborted) return;

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Cartesia error ${response.status}: ${err}`);
    }

    if (!response.body) throw new Error('No response body from Cartesia');

    const reader = response.body.getReader();
    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done || signal?.aborted) break;
        yield Buffer.from(value);
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

}
