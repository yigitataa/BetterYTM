import { createServer } from 'node:http';
import { ROOM_PROTOCOL_VERSION, type HealthResponse } from '@better-ytm/shared';
import { attachRoomServer, type RoomServerOptions } from './rooms.js';

export function createRoomApp(options: RoomServerOptions = {}) {
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    if (request.url?.split('?')[0] === '/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      const health: HealthResponse = {
        status: 'ok',
        service: 'better-ytm-server',
        protocolVersion: ROOM_PROTOCOL_VERSION,
      };
      response.writeHead(200);
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify(health));
      return;
    }
    response.writeHead(404);
    response.end(JSON.stringify({ error: 'Not found' }));
  });
  const rooms = attachRoomServer(server, options);
  return {
    server,
    rooms,
    close: () =>
      new Promise<void>((resolve, reject) => {
        rooms.close();
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}
