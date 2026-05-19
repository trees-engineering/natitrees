require('dotenv').config();
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

console.log('Testing Deepgram connection with call config...');

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const connection = deepgram.listen.live({
  encoding: 'mulaw',
  sample_rate: 8000,
  channels: 1,
  model: 'nova-2',
  language: 'en',
  punctuate: true,
  interim_results: false,
  endpointing: 300,
});

connection.on(LiveTranscriptionEvents.Open, () => {
  console.log('SUCCESS — Deepgram connected with mulaw config');
  connection.finish();
  process.exit(0);
});

connection.on(LiveTranscriptionEvents.Error, (err) => {
  console.error('FAILED — error:', JSON.stringify(err));
});

connection.on(LiveTranscriptionEvents.Close, (event) => {
  console.warn('Closed — code:', event?.code, 'reason:', event?.reason);
  process.exit(1);
});

setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, 10000);
