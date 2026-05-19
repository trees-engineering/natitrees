const WebSocket = require('ws');

const ws = new WebSocket(
  'wss://api.deepgram.com/v2/listen?model=flux-general-en',
  { headers: { Authorization: 'Token 2978b9758777d567da06cc490a3a967365f2cda8' } }
);

ws.on('open', () => {
  console.log('[connected]');
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'KeepAlive' }));
      console.log('[keepalive sent]', new Date().toISOString());
    }
  }, 8000);
});

ws.on('message', (data) => {
  console.log('[message]', data.toString().slice(0, 200));
});

ws.on('close', (code, reason) => {
  console.log('[closed] code:', code, 'reason:', reason.toString());
});

ws.on('error', (err) => {
  console.log('[error]', err.message);
});
