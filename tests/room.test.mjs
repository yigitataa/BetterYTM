import assert from 'node:assert/strict';
import test from 'node:test';
import {
  roomPlaybackFromSnapshot,
  roomPlaybackSchema,
  roomSnapshotEventSchema,
  roomSnapshotSchema,
} from '../packages/shared/dist/index.js';

const playback = {
  track: { videoId: 'abcdefgh_-1', title: 'Bir şarkı', artist: 'Sanatçı' },
  playing: true,
  positionMs: 1000,
  durationMs: 200000,
};
const room = {
  roomId: 'room_1',
  code: 'ABCDEFGH23',
  playbackEpoch: 0,
  playbackRevision: 0,
  controllerClientId: 'host_1',
  revision: 3,
  serverTimeMs: 10000,
  hostClientId: 'host_1',
  members: [{ clientId: 'host_1', displayName: 'Yiğit' }],
  playback,
  queue: [],
};

test('room playback projects public identity and drops device-specific state', () => {
  const local = {
    ...playback,
    track: {
      ...playback.track,
      id: 'youtube:abcdefgh_-1',
      artworkUrl: 'https://example.test/art.jpg',
    },
    volume: 0.7,
    muted: true,
    buffering: false,
    ended: false,
    capturedAt: 9999,
  };
  assert.deepEqual(roomPlaybackFromSnapshot(local), playback);
  assert.equal(roomPlaybackFromSnapshot({ ...local, track: null }), null);
  assert.equal(roomPlaybackFromSnapshot({ ...local, track: { id: 'unknown' } }), null);
  assert.equal(roomPlaybackFromSnapshot({ ...local, positionMs: Infinity }), null);
});

test('wire playback rejects private fields, invalid identities and impossible positions', () => {
  for (const value of [
    { ...playback, volume: 0.5 },
    { ...playback, mediaUrl: 'https://example.test/audio' },
    { ...playback, track: { videoId: 'short' } },
    { ...playback, positionMs: -1 },
    { ...playback, positionMs: 200001 },
    { ...playback, durationMs: Infinity },
    { ...playback, track: null },
  ])
    assert.equal(roomPlaybackSchema.safeParse(value).success, false);
  assert.equal(
    roomPlaybackSchema.safeParse({ track: null, playing: false, positionMs: 0, durationMs: null })
      .success,
    true,
  );
});

test('room snapshots require unique members and a present host', () => {
  assert.equal(roomSnapshotSchema.safeParse(room).success, true);
  for (const patch of [
    { hostClientId: 'missing' },
    { members: [] },
    { members: [room.members[0], room.members[0]] },
    { members: [{ clientId: 'host_1', displayName: '  ' }] },
    { revision: 1.5 },
    { serverTimeMs: NaN },
  ])
    assert.equal(roomSnapshotSchema.safeParse({ ...room, ...patch }).success, false);
});

test('snapshot envelopes reject unsupported protocols and mismatched room revisions', () => {
  const event = {
    protocolVersion: 2,
    type: 'room.snapshot',
    eventId: 'event_1',
    roomId: 'room_1',
    originClientId: 'host_1',
    sentAt: 10000,
    revision: 3,
    snapshot: room,
  };
  assert.equal(roomSnapshotEventSchema.safeParse(event).success, true);
  for (const patch of [
    { protocolVersion: 999 },
    { roomId: 'room_2' },
    { revision: 4 },
    { token: 'secret' },
  ])
    assert.equal(roomSnapshotEventSchema.safeParse({ ...event, ...patch }).success, false);
});

test('shared queue preserves repeated songs but requires unique entry IDs and bounded size', () => {
  const item = { id: 'entry_1', track: playback.track, addedByClientId: 'host_1' };
  assert.equal(
    roomSnapshotSchema.safeParse({ ...room, queue: [item, { ...item, id: 'entry_2' }] }).success,
    true,
  );
  assert.equal(roomSnapshotSchema.safeParse({ ...room, queue: [item, item] }).success, false);
  assert.equal(
    roomSnapshotSchema.safeParse({ ...room, queue: [{ ...item, addedByClientId: '' }] }).success,
    false,
  );
  assert.equal(
    roomSnapshotSchema.safeParse({
      ...room,
      queue: Array.from({ length: 201 }, (_, i) => ({ ...item, id: `entry_${i}` })),
    }).success,
    false,
  );
  // A song stays queued when the member who contributed it leaves.
  assert.equal(
    roomSnapshotSchema.safeParse({
      ...room,
      queue: [{ ...item, addedByClientId: 'departed_member' }],
    }).success,
    true,
  );
});

test('room time projects moving playback, clamps duration and preserves paused positions', async () => {
  const { roomPosition, clockSample, estimateClock } =
    await import('../packages/shared/dist/index.js');
  assert.equal(roomPosition(room, room.serverTimeMs + 1000), 2000);
  assert.equal(
    roomPosition({ ...room, playback: { ...playback, playing: false } }, room.serverTimeMs + 1000),
    1000,
  );
  assert.equal(roomPosition(room, room.serverTimeMs - 1000), 1000);
  assert.equal(roomPosition(room, room.serverTimeMs + 999999), playback.durationMs);
  assert.deepEqual(clockSample(1000, 1100, 2050), { offset: 1000, rtt: 100 });
  assert.equal(clockSample(1000, 900, 1000), null);
  assert.equal(clockSample(1000, 12000, 1000), null);
  assert.deepEqual(
    estimateClock([
      { offset: 1000, rtt: 20 },
      { offset: 1010, rtt: 30 },
      { offset: 5000, rtt: 4000 },
    ]),
    { offset: 1010, rtt: 20 },
  );
});

test('invite links and song inputs reject deceptive origins and preserve server selection', async () => {
  const { normalizeRoomServer, parseRoomInvite, roomInvite, trackFromRoomInput } =
    await import('../packages/shared/dist/index.js');
  assert.equal(normalizeRoomServer('ws://127.0.0.1:8787'), 'ws://127.0.0.1:8787/ws');
  assert.equal(normalizeRoomServer('wss://rooms.example.test'), 'wss://rooms.example.test/ws');
  for (const url of [
    'ws://remote.example.test/ws',
    'https://rooms.example.test',
    'wss://user:password@example.test/ws',
    'wss://example.test/ws?token=secret',
  ])
    assert.equal(normalizeRoomServer(url), null);
  const link = roomInvite('wss://rooms.example.test/ws', 'ABCDEFGH23');
  assert.deepEqual(parseRoomInvite(link), {
    code: 'ABCDEFGH23',
    serverUrl: 'wss://rooms.example.test/ws',
  });
  assert.deepEqual(parseRoomInvite('abcde-fgh23'), { code: 'ABCDEFGH23', serverUrl: null });
  assert.equal(
    parseRoomInvite(link.replace('music.youtube.com', 'music.youtube.com.evil.test')),
    null,
  );
  assert.deepEqual(trackFromRoomInput('https://music.youtube.com/watch?v=abcdefgh_-1&list=test'), {
    videoId: 'abcdefgh_-1',
  });
  assert.deepEqual(trackFromRoomInput('https://youtu.be/abcdefgh_-1'), { videoId: 'abcdefgh_-1' });
  for (const value of [
    'short',
    'javascript:alert(1)',
    'https://youtube.com.evil.test/watch?v=abcdefgh_-1',
    'https://user:password@youtube.com/watch?v=abcdefgh_-1',
    'http://youtube.com/watch?v=abcdefgh_-1',
  ])
    assert.equal(trackFromRoomInput(value), null);
});
