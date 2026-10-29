import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createRoomApp } from '../../apps/server/dist/app.js';
import { roomServerMessageSchema } from '../../packages/shared/dist/index.js';
const require = createRequire(new URL('../../apps/server/package.json', import.meta.url));
const WebSocket = require('ws');
const playback = {
  track: { videoId: 'abcdefgh_-1', title: 'First' },
  playing: true,
  positionMs: 1000,
  durationMs: 180000,
};
const track = { videoId: 'bcdefghi_-2', title: 'Second' };

async function setup(t, options = {}) {
  const app = createRoomApp(options);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.socket.terminate();
    await app.close();
  });
  async function client(id = randomUUID()) {
    const socket = new WebSocket(url);
    const messages = [];
    let snapshot = null;
    socket.on('message', (raw) => {
      const parsed = roomServerMessageSchema.parse(JSON.parse(raw.toString()));
      messages.push(parsed);
      if ('snapshot' in parsed) snapshot = parsed.snapshot;
    });
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const value = {
      id,
      socket,
      messages,
      get snapshot() {
        return snapshot;
      },
      send(type, data = {}, eventId = randomUUID()) {
        socket.send(
          JSON.stringify({
            protocolVersion: 1,
            type,
            eventId,
            originClientId: id,
            sentAt: Date.now(),
            ...data,
          }),
        );
        return eventId;
      },
      async wait(predicate, from = 0) {
        const until = Date.now() + 3000;
        while (Date.now() < until) {
          const found = messages.slice(from).find(predicate);
          if (found) return found;
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new Error('Expected room message was not received.');
      },
      command(action, baseRevision = snapshot.revision, eventId) {
        return this.send(
          'room.command',
          { roomId: snapshot.roomId, baseRevision, action },
          eventId,
        );
      },
    };
    clients.push(value);
    return value;
  }
  return { app, client, url };
}

test('two clients share queue, host controls playback, duplicate commands do not duplicate songs', async (t) => {
  const { client } = await setup(t);
  const host = await client();
  host.send('room.create', { displayName: 'Host', playback });
  const welcome = await host.wait((m) => m.type === 'room.welcome');
  const guest = await client();
  guest.send('room.join', { displayName: 'Guest', code: welcome.snapshot.code });
  await guest.wait((m) => m.type === 'room.welcome');
  assert.equal(guest.snapshot.members.length, 2);
  const addId = guest.command({ type: 'queue.add', track });
  await host.wait((m) => m.type === 'room.snapshot' && m.snapshot.queue.length === 1);
  guest.command({ type: 'queue.add', track }, guest.snapshot.revision, addId);
  await guest.wait((m) => m.type === 'command.ack' && m.eventId === addId);
  const forbiddenId = guest.command({
    type: 'playback.update',
    playback: { ...playback, playing: false },
  });
  await guest.wait(
    (m) => m.type === 'room.error' && m.eventId === forbiddenId && m.code === 'forbidden',
  );
  assert.equal(host.snapshot.queue.length, 1);
  const stale = host.command({ type: 'queue.next' }, 0);
  await host.wait((m) => m.type === 'room.error' && m.eventId === stale && m.code === 'conflict');
  host.command({ type: 'queue.next' });
  await guest.wait(
    (m) => m.type === 'room.snapshot' && m.snapshot.playback.track?.videoId === track.videoId,
  );
  assert.equal(guest.snapshot.queue.length, 0);
  assert.equal(guest.snapshot.playback.playing, true);
  assert.equal(guest.snapshot.playbackEpoch, 1);
  const pause = host.command({
    type: 'playback.update',
    playback: { track, playing: false, positionMs: 2000, durationMs: 180000 },
  });
  await host.wait((m) => m.type === 'command.ack' && m.eventId === pause);
  await guest.wait((m) => m.type === 'room.snapshot' && !m.snapshot.playback.playing);
  assert.equal(guest.snapshot.playback.positionMs, 2000);
});

test('only host can reorder or remove; repeated video IDs have distinct queue entries', async (t) => {
  const { client } = await setup(t);
  const host = await client();
  host.send('room.create', { displayName: 'Host', playback });
  const welcome = await host.wait((m) => m.type === 'room.welcome');
  const guest = await client();
  guest.send('room.join', { displayName: 'Guest', code: welcome.snapshot.code });
  await guest.wait((m) => m.type === 'room.welcome');
  guest.command({ type: 'queue.add', track });
  await host.wait((m) => m.type === 'room.snapshot' && m.snapshot.queue.length === 1);
  guest.command({ type: 'queue.add', track: playback.track });
  await host.wait((m) => m.type === 'room.snapshot' && m.snapshot.queue.length === 2);
  const [first, second] = host.snapshot.queue;
  const forbidden = guest.command({ type: 'queue.remove', entryId: first.id });
  await guest.wait(
    (m) => m.type === 'room.error' && m.eventId === forbidden && m.code === 'forbidden',
  );
  host.command({ type: 'queue.move', entryId: second.id, direction: 'up' });
  await guest.wait((m) => m.type === 'room.snapshot' && m.snapshot.queue[0]?.id === second.id);
  host.command({ type: 'queue.remove', entryId: first.id });
  await guest.wait(
    (m) =>
      m.type === 'room.snapshot' &&
      m.snapshot.queue.length === 1 &&
      m.snapshot.queue[0].id === second.id,
  );
});

test('resume requires secret credentials, preserves full room state, and replaces old sockets', async (t) => {
  const { client } = await setup(t);
  const host = await client('host');
  host.send('room.create', { displayName: 'Host', playback });
  const welcome = await host.wait((m) => m.type === 'room.welcome');
  host.command({ type: 'queue.add', track });
  await host.wait((m) => m.type === 'room.snapshot' && m.snapshot.queue.length === 1);
  const attacker = await client('host');
  attacker.send('room.resume', { roomId: welcome.snapshot.roomId, token: 'x'.repeat(43) });
  await attacker.wait((m) => m.type === 'room.error' && m.code === 'unauthorized');
  const restored = await client('host');
  restored.send('room.resume', { roomId: welcome.snapshot.roomId, token: welcome.token });
  const resumed = await restored.wait((m) => m.type === 'room.welcome');
  assert.equal(resumed.snapshot.queue.length, 1);
  assert.equal(resumed.snapshot.hostClientId, 'host');
  assert.ok(resumed.snapshot.revision > welcome.snapshot.revision);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    restored.snapshot.members.find((member) => member.clientId === 'host').connected,
    true,
  );
});

test('host leave ends room; disconnect grace allows refresh and later expires the room', async (t) => {
  const { client, app } = await setup(t, { disconnectGraceMs: 80, sweepMs: 10 });
  const host = await client();
  host.send('room.create', { displayName: 'Host', playback });
  const welcome = await host.wait((m) => m.type === 'room.welcome');
  const guest = await client();
  guest.send('room.join', { displayName: 'Guest', code: welcome.snapshot.code });
  await guest.wait((m) => m.type === 'room.welcome');
  host.socket.close();
  await guest.wait(
    (m) =>
      m.type === 'room.snapshot' &&
      !m.snapshot.members.find((member) => member.clientId === host.id).connected,
  );
  await guest.wait((m) => m.type === 'room.error' && m.code === 'room-closed');
  assert.equal(app.rooms.roomCount, 0);
  const secondHost = await client();
  secondHost.send('room.create', { displayName: 'Host 2', playback });
  await secondHost.wait((m) => m.type === 'room.welcome');
  secondHost.send('room.leave', { roomId: secondHost.snapshot.roomId });
  await secondHost.wait((m) => m.type === 'room.error' && m.code === 'room-closed');
  assert.equal(app.rooms.roomCount, 0);
});

test('malformed messages, cross-room commands, and untrusted browser origins are rejected', async (t) => {
  const { client, url } = await setup(t);
  const host = await client();
  host.socket.send('{bad json');
  await host.wait((m) => m.type === 'room.error' && m.code === 'invalid-message');
  host.send('room.create', { displayName: 'Host', playback });
  await host.wait((m) => m.type === 'room.welcome');
  const id = host.send('room.command', {
    roomId: 'other-room',
    baseRevision: 1,
    action: { type: 'queue.add', track },
  });
  await host.wait((m) => m.type === 'room.error' && m.eventId === id && m.code === 'unauthorized');
  const rejected = new WebSocket(url, { origin: 'https://untrusted.example' });
  const status = await new Promise((resolve) => {
    rejected.once('unexpected-response', (_, response) => {
      resolve(response.statusCode);
      rejected.terminate();
    });
    rejected.on('error', () => {});
  });
  assert.equal(status, 403);
});
