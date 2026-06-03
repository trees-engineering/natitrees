// AudioWorklet processor — captures raw mic PCM and sends Int16 chunks to main thread
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._bufSize = 4800; // 100ms of audio at 48kHz
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      // Convert float32 [-1, 1] to int16 [-32768, 32767]
      this._buf.push(Math.max(-32768, Math.min(32767, ch[i] * 32768 | 0)));
    }
    if (this._buf.length >= this._bufSize) {
      const arr = new Int16Array(this._buf.splice(0, this._bufSize));
      this.port.postMessage(arr.buffer, [arr.buffer]);
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
