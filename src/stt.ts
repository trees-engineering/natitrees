import { DeepgramSTT } from './providers/stt/deepgram';

export interface STTProvider {
  sendAudio(chunk: Buffer): void;
  onTranscript(callback: (text: string) => void): void;
  onInterimTranscript(callback: (text: string) => void): void;
  onSpeechStart(callback: () => void): void;
  close(): void;
}

export function createSTT(): STTProvider {
  const provider = process.env.STT_PROVIDER ?? 'deepgram';

  switch (provider) {
    case 'deepgram':
    default:
      console.log('[stt] Using Deepgram');
      return new DeepgramSTT();
  }
}
