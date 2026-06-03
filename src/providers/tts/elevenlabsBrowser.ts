export class ElevenLabsBrowserTTS {
  private apiKey: string;
  private voiceId: string;

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY!;
    this.voiceId = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL';
  }

  // Returns a complete MP3 buffer — browser can decode with AudioContext.decodeAudioData()
  async synthesize(text: string, signal?: AbortSignal): Promise<Buffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: 'POST',
        signal,
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          output_format: 'mp3_44100_64',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`ElevenLabs error ${response.status}: ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
