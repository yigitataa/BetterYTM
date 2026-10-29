import { createRoomApp } from './app.js';

const host = process.env.HOST ?? '127.0.0.1';
const rawPort = process.env.PORT ?? '8787';
const port = Number(rawPort);

if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!host.trim()) {
  throw new Error('HOST must not be empty.');
}

const app = createRoomApp();
const { server } = app;

server.on('error', (error) => {
  console.error('[Better YTM] Server error:', error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.info(`[Better YTM] Server listening on ${JSON.stringify(server.address())}`);
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  void app.close().catch((error: unknown) => {
    if (error) {
      console.error('[Better YTM] Server shutdown failed:', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
