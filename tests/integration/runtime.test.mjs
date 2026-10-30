import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createRoomApp } from '../../apps/server/dist/app.js';
import { createRoomController } from '../../.test-build/listen-together/controller.js';
import { registerRoomConnections } from '../../.test-build/background/rooms.js';
import {
  DEFAULT_ROOM_SERVER,
  ROOM_PORT_NAME,
  roomConnectionStateSchema,
} from '../../packages/shared/dist/index.js';
const require = createRequire(new URL('../../apps/server/package.json', import.meta.url));
const NativeWebSocket = require('ws');
const A = 'abcdefgh_-1';
const B = 'bcdefghi_-2';
const C = 'cdefghij_-3';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, message, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error(message);
}
class Slot {
  listeners = new Set();
  addListener = (fn) => this.listeners.add(fn);
  removeListener = (fn) => this.listeners.delete(fn);
  emit = (...args) => {
    for (const fn of this.listeners) fn(...args);
  };
}
function chromeFixture(store = new Map()) {
  const api = {
    runtime: { id: 'fixture-extension', onConnect: new Slot() },
    tabs: { onRemoved: new Slot() },
    storage: {
      onChanged: new Slot(),
      session: {
        async get(key) {
          if (key === null)
            return Object.fromEntries(
              [...store.entries()].map(([k, v]) => [k, structuredClone(v)]),
            );
          return { [key]: structuredClone(store.get(key)) };
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) store.set(key, structuredClone(value));
        },
        async remove(key) {
          for (const item of Array.isArray(key) ? key : [key]) store.delete(item);
        },
      },
    },
  };
  function bridge(tabId) {
    let state = {
      status: 'idle',
      clientId: 'pending',
      snapshot: null,
      serverUrl: DEFAULT_ROOM_SERVER,
      displayName: '',
      error: null,
      clockOffsetMs: 0,
      rttMs: null,
      panelOpen: false,
    };
    const listeners = new Set();
    let port;
    let active = false;
    const messages = [];
    const commands = [];
    return {
      messages,
      commands,
      getState: () => state,
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      start() {
        active = true;
        port = {
          name: ROOM_PORT_NAME,
          sender: {
            id: api.runtime.id,
            frameId: 0,
            url: 'https://music.youtube.com/',
            tab: { id: tabId },
          },
          onMessage: new Slot(),
          onDisconnect: new Slot(),
          postMessage(value) {
            const copy = structuredClone(value);
            queueMicrotask(() => {
              if (!active) return;
              messages.push(copy);
              if (copy.type === 'state') {
                state = roomConnectionStateSchema.parse(copy.state);
                for (const listener of listeners) listener();
              }
            });
          },
        };
        api.runtime.onConnect.emit(port);
      },
      stop() {
        if (!active) return;
        active = false;
        port?.onDisconnect.emit();
      },
      send(request) {
        commands.push(structuredClone(request));
        const current = port;
        queueMicrotask(() => current.onMessage.emit(structuredClone(request)));
      },
    };
  }
  return { api, bridge, store };
}
function adapterFixture(videoId = A) {
  const listeners = new Set();
  let id = videoId;
  let base = 0;
  let at = Date.now();
  let playing = false;
  let ended = false;
  const adapter = {
    blocked: false,
    seekUnavailable: false,
    buffering: false,
    eventDelay: 0,
    opens: [],
    getTrackMetadata: () => ({
      videoId: id,
      title: `Track ${id}`,
      artist: 'Fixture',
      artworkUrl: null,
    }),
    getHealth: () => ({
      capabilities: { playPause: true, seeking: true, openTrack: true, trackIdentity: true },
    }),
    getPlaybackSnapshot() {
      return {
        track: { id: `youtube:${id}`, videoId: id, title: `Track ${id}`, artist: 'Fixture' },
        playing,
        positionMs: Math.min(180000, Math.round(base + (playing ? Date.now() - at : 0))),
        durationMs: 180000,
        volume: 0.6,
        muted: false,
        buffering: this.buffering,
        ended,
        capturedAt: Date.now(),
      };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(type) {
      if (this.eventDelay) {
        setTimeout(() => {
          for (const fn of listeners)
            fn({ type, snapshot: this.getPlaybackSnapshot(), metadata: this.getTrackMetadata() });
        }, this.eventDelay);
        return;
      }
      for (const fn of listeners)
        fn({ type, snapshot: this.getPlaybackSnapshot(), metadata: this.getTrackMetadata() });
    },
    async play() {
      if (playing && !ended) return { ok: true };
      if (this.blocked)
        return { ok: false, error: { code: 'autoplay-blocked', message: 'Blocked' } };
      base = this.getPlaybackSnapshot().positionMs;
      at = Date.now();
      playing = true;
      ended = false;
      this.emit('play');
      return { ok: true };
    },
    async pause() {
      if (!playing) return { ok: true };
      base = this.getPlaybackSnapshot().positionMs;
      playing = false;
      this.emit('pause');
      return { ok: true };
    },
    togglePlayback() {
      return playing ? this.pause() : this.play();
    },
    async seek(seconds) {
      if (this.seekUnavailable)
        return { ok: false, error: { code: 'unavailable', message: 'Loading' } };
      base = seconds * 1000;
      at = Date.now();
      ended = base >= 180000;
      this.emit('seek');
      return { ok: true };
    },
    async openTrack(value) {
      this.opens.push(value);
      id = value;
      base = 0;
      at = Date.now();
      playing = false;
      ended = false;
      this.emit('trackchange');
      return { ok: true };
    },
    end() {
      base = 180000;
      playing = false;
      ended = true;
      this.emit('ended');
    },
    get subscriberCount() {
      return listeners.size;
    },
  };
  return adapter;
}
async function runtime(t) {
  const app = createRoomApp();
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  const sockets = [];
  globalThis.WebSocket = class extends NativeWebSocket {
    constructor(...args) {
      super(...args);
      sockets.push(this);
    }
  };
  const chrome = chromeFixture();
  globalThis.chrome = chrome.api;
  const worker = registerRoomConnections();
  const controllers = [];
  function client(tabId, adapter = adapterFixture()) {
    const bridge = chrome.bridge(tabId);
    const controller = createRoomController(adapter, bridge);
    controllers.push(controller);
    controller.start();
    return { controller, bridge, adapter };
  }
  t.after(async () => {
    for (const controller of controllers) controller.stop();
    await delay(10);
    await worker.dispose();
    await app.close();
    delete globalThis.chrome;
    delete globalThis.WebSocket;
  });
  return { app, url, chrome, worker, client, sockets, controllers };
}

test(
  'both members synchronize native play/pause/seek and shared queue across refresh without echoes',
  { timeout: 20000 },
  async (t) => {
    const env = await runtime(t);
    const host = env.client(1);
    const guest = env.client(2);
    await until(
      () => host.controller.getState().connection.clientId !== 'pending',
      'Worker did not attach',
    );
    host.controller.create(env.url, 'Host');
    await until(
      () => host.controller.getState().connection.status === 'connected',
      'Host did not create room',
    );
    const roomId = host.controller.getState().connection.snapshot.roomId;
    const code = host.controller.getState().connection.snapshot.code;
    guest.controller.join(env.url, 'Guest', code);
    await until(
      () => guest.controller.getState().connection.status === 'connected',
      'Guest did not join',
    );
    await host.controller.togglePlayback();
    await until(() => guest.adapter.getPlaybackSnapshot().playing, 'Play was not synchronized');
    await host.adapter.seek(30);
    await until(
      () =>
        Math.abs(
          guest.adapter.getPlaybackSnapshot().positionMs -
            host.adapter.getPlaybackSnapshot().positionMs,
        ) < 750,
      'Seek was not synchronized',
    );
    await guest.adapter.seek(90);
    await until(
      () =>
        Math.abs(
          host.adapter.getPlaybackSnapshot().positionMs -
            guest.adapter.getPlaybackSnapshot().positionMs,
        ) < 750,
      'Guest seek did not reach the first participant',
    );
    assert.equal(
      guest.bridge.commands.filter((m) => m.action?.type === 'playback.update').length,
      0,
    );
    await guest.adapter.pause();
    await until(() => !host.adapter.getPlaybackSnapshot().playing, 'Guest native pause was lost');
    host.adapter.buffering = true;
    await host.adapter.play();
    await until(
      () => guest.adapter.getPlaybackSnapshot().playing,
      'Play during buffering was lost',
    );
    host.adapter.buffering = false;
    await guest.controller.resync();
    await guest.adapter.pause();
    await until(() => !host.adapter.getPlaybackSnapshot().playing, 'Pause after resync was lost');
    await guest.adapter.play();
    await until(
      () => host.adapter.getPlaybackSnapshot().playing,
      'A no-op resync swallowed the next native play',
    );
    guest.controller.addTrack({ videoId: B });
    await until(
      () => host.controller.getState().connection.snapshot.queue.length === 1,
      'Shared queue add failed',
    );
    host.controller.addTrack({ videoId: C });
    await until(
      () => host.controller.getState().connection.snapshot.queue.length === 2,
      'Second queue add failed',
    );
    const firstEntry = host.controller.getState().connection.snapshot.queue[0];
    const secondEntry = host.controller.getState().connection.snapshot.queue[1];
    host.controller.command({ type: 'queue.move', entryId: secondEntry.id, direction: 'up' });
    await until(
      () => guest.controller.getState().connection.snapshot.queue[0].id === secondEntry.id,
      'Queue reorder did not propagate',
    );
    host.controller.command({ type: 'queue.remove', entryId: firstEntry.id });
    await until(
      () => host.controller.getState().connection.snapshot.queue.length === 1,
      'Queue removal failed',
    );
    guest.controller.next();
    await until(
      () =>
        host.adapter.getTrackMetadata().videoId === C &&
        guest.adapter.getTrackMetadata().videoId === C &&
        guest.adapter.getPlaybackSnapshot().playing,
      'Queue track did not reach both players',
    );
    assert.equal(host.adapter.opens.filter((id) => id === C).length, 1);
    assert.equal(guest.adapter.opens.filter((id) => id === C).length, 1);
    const saved = env.chrome.store.get('betterYtm.room.1');
    assert.ok(saved.resume.token.length >= 32);
    assert.equal(
      JSON.stringify(host.bridge.messages).includes(saved.resume.token),
      false,
      'Credential leaked to content UI',
    );
    host.controller.stop();
    const restored = env.client(1, adapterFixture(C));
    await until(
      () =>
        restored.controller.getState().connection.status === 'connected' &&
        restored.adapter.getPlaybackSnapshot().playing,
      'Refresh failed to resume playback',
    );
    assert.equal(restored.controller.getState().connection.snapshot.roomId, roomId);
    assert.equal(restored.controller.getState().connection.clientId, saved.clientId);
    restored.controller.addTrack({ videoId: B });
    await until(
      () => restored.controller.getState().connection.snapshot.queue.length === 1,
      'Queue was not available after refresh',
    );
    guest.adapter.end();
    await until(
      () =>
        restored.adapter.getTrackMetadata().videoId === B &&
        guest.adapter.getTrackMetadata().videoId === B &&
        guest.adapter.getPlaybackSnapshot().playing,
      'Track end did not advance shared queue',
    );
    guest.adapter.end();
    await until(
      () => !guest.controller.getState().connection.snapshot.playback.playing,
      'Empty queue did not stop playback',
    );
    await restored.controller.resync();
    assert.equal(restored.adapter.getPlaybackSnapshot().playing, false);
    guest.controller.leave();
    await until(
      () => guest.controller.getState().connection.status === 'idle',
      'Guest did not leave',
    );
    assert.equal(restored.controller.getState().connection.snapshot.roomId, roomId);
    restored.controller.stop(true);
    await until(() => env.app.rooms.roomCount === 0, 'Disable did not end host room');
    assert.equal(restored.adapter.subscriberCount, 0);
  },
);

test(
  'joining and resync retain the moving position, retry unavailable seek, and delayed remote events do not echo',
  { timeout: 12000 },
  async (t) => {
    const env = await runtime(t);
    const host = env.client(61);
    const guestAdapter = adapterFixture();
    guestAdapter.seekUnavailable = true;
    const guest = env.client(62, guestAdapter);
    await until(
      () => host.controller.getState().connection.clientId !== 'pending',
      'Worker not attached',
    );
    await host.adapter.seek(73);
    await host.adapter.play();
    host.controller.create(env.url, 'Host');
    await until(
      () => host.controller.getState().connection.status === 'connected',
      'Create failed',
    );
    guest.controller.join(env.url, 'Guest', host.controller.getState().connection.snapshot.code);
    await until(
      () =>
        guest.controller.getState().connection.status === 'connected' &&
        guest.adapter.getPlaybackSnapshot().playing,
      'Seek failure prevented play',
    );
    await host.adapter.pause();
    await until(() => !guest.adapter.getPlaybackSnapshot().playing, 'Seek failure prevented pause');
    guest.adapter.seekUnavailable = false;
    await guest.controller.resync();
    await until(
      () =>
        Math.abs(
          host.adapter.getPlaybackSnapshot().positionMs -
            guest.adapter.getPlaybackSnapshot().positionMs,
        ) < 150,
      'Resync reset or lost the paused position',
    );
    assert.ok(guest.adapter.getPlaybackSnapshot().positionMs > 73000);
    guest.adapter.eventDelay = 900;
    const before = guest.bridge.commands.filter((m) =>
      m.action?.type.startsWith('playback.'),
    ).length;
    await host.adapter.play();
    await until(() => guest.adapter.getPlaybackSnapshot().playing, 'Remote play failed');
    await host.adapter.seek(96);
    await until(
      () => guest.adapter.getPlaybackSnapshot().positionMs >= 96000,
      'Remote seek failed',
    );
    await delay(1200);
    assert.equal(
      guest.bridge.commands.filter((m) => m.action?.type.startsWith('playback.')).length,
      before,
      'Remote media events were published back into the room',
    );
    assert.ok(
      Math.abs(
        host.adapter.getPlaybackSnapshot().positionMs -
          guest.adapter.getPlaybackSnapshot().positionMs,
      ) < 750,
    );
    guest.adapter.eventDelay = 0;
    await guest.adapter.openTrack(B);
    await guest.adapter.play();
    await until(
      () =>
        host.adapter.getTrackMetadata().videoId === B && host.adapter.getPlaybackSnapshot().playing,
      'Guest native track change was lost',
    );
  },
);

test(
  'WebSocket disconnect reconnects from full snapshot and worker restart restores private credentials',
  { timeout: 12000 },
  async (t) => {
    const env = await runtime(t);
    const host = env.client(11);
    await until(
      () => host.controller.getState().connection.clientId !== 'pending',
      'Worker did not attach',
    );
    host.controller.create(env.url, 'Host');
    await until(
      () => host.controller.getState().connection.status === 'connected',
      'Create failed',
    );
    host.controller.addTrack({ videoId: B });
    await until(
      () => host.controller.getState().connection.snapshot.queue.length === 1,
      'Add failed',
    );
    const before = host.controller.getState().connection;
    // BFCache/runtime suspension reuses the controller and must restore authority,
    // rather than publishing an unrelated local position when it starts again.
    host.controller.stop();
    await host.adapter.seek(50);
    host.controller.start();
    await until(
      () => host.adapter.getPlaybackSnapshot().positionMs < 1000,
      'Reused controller did not restore room position',
    );
    env.sockets[0].terminate();
    await until(
      () => host.controller.getState().connection.status === 'reconnecting',
      'Disconnect state missing',
    );
    await until(
      () => host.controller.getState().connection.status === 'connected',
      'Reconnect failed',
    );
    assert.equal(host.controller.getState().connection.snapshot.queue.length, 1);
    host.controller.stop();
    await delay(10);
    await env.worker.dispose();
    const nextChrome = chromeFixture(env.chrome.store);
    globalThis.chrome = nextChrome.api;
    const restartedWorker = registerRoomConnections();
    const bridge = nextChrome.bridge(11);
    const restored = createRoomController(adapterFixture(), bridge);
    env.controllers.push(restored);
    t.after(() => restartedWorker.dispose());
    restored.start();
    await until(
      () => restored.getState().connection.status === 'connected',
      'Worker restart did not restore session',
    );
    assert.equal(restored.getState().connection.clientId, before.clientId);
    assert.equal(restored.getState().connection.snapshot.roomId, before.snapshot.roomId);
    assert.equal(restored.getState().connection.snapshot.queue.length, 1);
  },
);

test(
  'autoplay denial is visible and recovers after explicit user gesture',
  { timeout: 8000 },
  async (t) => {
    const env = await runtime(t);
    const hostAdapter = adapterFixture();
    await hostAdapter.play();
    const host = env.client(21, hostAdapter);
    const guestAdapter = adapterFixture();
    guestAdapter.blocked = true;
    const guest = env.client(22, guestAdapter);
    await until(
      () => host.controller.getState().connection.clientId !== 'pending',
      'Worker not attached',
    );
    host.controller.create(env.url, 'Host');
    await until(
      () => host.controller.getState().connection.status === 'connected',
      'Create failed',
    );
    guest.controller.join(env.url, 'Guest', host.controller.getState().connection.snapshot.code);
    await until(
      () => guest.controller.getState().issue?.includes('Tarayıcı'),
      'Autoplay error was not shown',
    );
    assert.equal(guest.controller.getState().connection.status, 'connected');
    guestAdapter.blocked = false;
    await guest.controller.resync();
    await until(
      () => guestAdapter.getPlaybackSnapshot().playing && !guest.controller.getState().issue,
      'Gesture did not recover playback',
    );
  },
);

test('disabling the feature ends active rooms and removes dormant resume credentials', async (t) => {
  const env = await runtime(t);
  const host = env.client(41);
  await until(
    () => host.controller.getState().connection.clientId !== 'pending',
    'Worker not attached',
  );
  host.controller.create(env.url, 'Host');
  await until(() => host.controller.getState().connection.status === 'connected', 'Create failed');
  env.chrome.store.set('betterYtm.room.99', { resume: { roomId: 'dormant', token: 'private' } });
  env.chrome.api.storage.onChanged.emit(
    { 'betterYtm.settings': { newValue: { enabled: false } } },
    'local',
  );
  await until(
    () =>
      env.app.rooms.roomCount === 0 &&
      ![...env.chrome.store.keys()].some((key) => key.startsWith('betterYtm.room.')),
    'Disable left an active room or stored credentials',
  );
});

test('an empty room can start later and a departed guest can join again with a new identity', async (t) => {
  const env = await runtime(t);
  const hostAdapter = adapterFixture();
  const read = hostAdapter.getPlaybackSnapshot.bind(hostAdapter);
  let ready = false;
  hostAdapter.getPlaybackSnapshot = () => (ready ? read() : null);
  const host = env.client(51, hostAdapter);
  const guest = env.client(52);
  await until(
    () => host.controller.getState().connection.clientId !== 'pending',
    'Worker not attached',
  );
  host.controller.create(env.url, 'Host');
  await until(
    () => host.controller.getState().connection.status === 'connected',
    'Empty room create failed',
  );
  assert.equal(host.controller.getState().connection.snapshot.playback.track, null);
  const code = host.controller.getState().connection.snapshot.code;
  guest.controller.join(env.url, 'Guest', code);
  await until(
    () => guest.controller.getState().connection.status === 'connected',
    'Empty room join failed',
  );
  ready = true;
  hostAdapter.emit('metadatachange');
  await until(
    () => guest.controller.getState().connection.snapshot.playback.track?.videoId === A,
    'Host stayed blocked after empty room',
  );
  const identity = guest.controller.getState().connection.clientId;
  guest.controller.leave();
  await until(() => guest.controller.getState().connection.status === 'idle', 'Guest leave failed');
  assert.notEqual(guest.controller.getState().connection.clientId, identity);
  guest.controller.join(env.url, 'Guest', code);
  await until(
    () => guest.controller.getState().connection.status === 'connected',
    'Guest rejoin failed',
  );
  assert.equal(guest.controller.getState().connection.snapshot.members.length, 2);
});
