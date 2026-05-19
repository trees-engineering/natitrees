import { ElevenLabsTTS } from './providers/tts/elevenlabs';
import { CartesiaTTS } from './providers/tts/cartesia';
import { FishAudioTTS } from './providers/tts/fishaudio';

export interface TTSProvider {
  stream(text: string, signal?: AbortSignal): AsyncGenerator<Buffer>;
}

export function createTTS(): TTSProvider {
  const provider = process.env.TTS_PROVIDER ?? 'elevenlabs';

  switch (provider) {
    case 'cartesia':
      console.log('[tts] Using Cartesia');
      return new CartesiaTTS();
    case 'fishaudio':
      console.log('[tts] Using Fish Audio');
      return new FishAudioTTS();
    case 'elevenlabs':
    default:
      console.log('[tts] Using ElevenLabs');
      return new ElevenLabsTTS();
  }
}
