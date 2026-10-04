import { createServer } from 'node:http';
import type { HealthResponse } from '@better-ytm/shared';

const host = process.env.HOST ?? '127.0.0.1';
const rawPort = process.env.PORT ?? '8787';
const port = Number(rawPort);

if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!host.trim()) {
  throw new Error('HOST must not be empty.');
}

const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');

  if (request.url?.split('?')[0] === '/health') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const health: HealthResponse = { status: 'ok', service: 'better-ytm-server' };
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(health));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: 'Not found' }));
});

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
  server.close((error) => {
    if (error) {
      console.error('[Better YTM] Server shutdown failed:', error);
      process.exitCode = 1;
    }
  });
  server.closeIdleConnections();
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
