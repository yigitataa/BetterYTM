import assert from 'node:assert/strict';
import test from 'node:test';
import { changedPlaybackEvents } from '../packages/ytm-adapter/dist/events.js';
import {
  safeArtworkUrl,
  trackFromMetadata,
  videoIdFromWatchLink,
  watchUrlForVideoId,
} from '../packages/ytm-adapter/dist/metadata.js';
import { finiteMilliseconds, seekablePosition } from '../packages/ytm-adapter/dist/player.js';

const base = 'https://music.youtube.com/';
const emptyMetadata = { videoId: null, title: null, artist: null, artworkUrl: null };
const snapshot = {
  playing: false,
  positionMs: 0,
  durationMs: 200000,
  volume: 0.5,
  muted: false,
  buffering: false,
  ended: false,
  track: null,
  capturedAt: 100,
};

test('watch identity accepts public watch links and rejects deceptive or incomplete URLs', () => {
  assert.equal(videoIdFromWatchLink('/watch?v=abcdefgh_-1&list=public', base), 'abcdefgh_-1');
  assert.equal(watchUrlForVideoId('abcdefgh_-1'), 'https://music.youtube.com/watch?v=abcdefgh_-1');
  for (const id of ['', 'short', 'abcdefgh_-1&v=bad']) assert.equal(watchUrlForVideoId(id), null);
  for (const href of [
    null,
    '/browse?v=abcdefgh_-1',
    '/watch?v=short',
    'https://music.youtube.com.evil.test/watch?v=abcdefgh_-1',
    'https://user:secret@music.youtube.com/watch?v=abcdefgh_-1',
    'javascript:alert(1)',
    'http://music.youtube.com/watch?v=abcdefgh_-1',
  ]) {
    assert.equal(videoIdFromWatchLink(href, base), null);
  }
});

test('artwork only accepts HTTPS without credentials', () => {
  assert.equal(
    safeArtworkUrl('https://images.example.test/cover.png', base),
    'https://images.example.test/cover.png',
  );
  for (const url of [
    null,
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'https://user:secret@images.example.test/cover.png',
  ])
    assert.equal(safeArtworkUrl(url, base), null);
});

test('track identity is never fabricated from a title or album artwork', () => {
  assert.equal(
    trackFromMetadata({ ...emptyMetadata, title: 'Song', artist: 'Artist' }, 200000),
    null,
  );
  const track = trackFromMetadata(
    { ...emptyMetadata, videoId: 'abcdefgh_-1', title: 'Song' },
    200000,
  );
  assert.deepEqual(track, {
    id: 'youtube:abcdefgh_-1',
    videoId: 'abcdefgh_-1',
    title: 'Song',
    durationMs: 200000,
  });
  assert.ok(Object.isFrozen(track));
});

test('media times reject invalid and overflowing values while preserving zero', () => {
  assert.equal(finiteMilliseconds(0), 0);
  assert.equal(finiteMilliseconds(30.039139), 30039);
  for (const value of [-1, NaN, Infinity, Number.MAX_VALUE])
    assert.equal(finiteMilliseconds(value), null);
});

test('seeking respects duration and seekable gaps', () => {
  const ranges = [
    { start: 0, end: 30 },
    { start: 50, end: 100 },
  ];
  assert.equal(seekablePosition(20, 100, ranges), true);
  assert.equal(seekablePosition(100, 100, ranges), true);
  for (const position of [-1, NaN, Infinity, 40, 101])
    assert.equal(seekablePosition(position, 100, ranges), false);
  assert.equal(seekablePosition(0, Infinity, ranges), false);
  assert.equal(seekablePosition(0, 100, []), false);
});

test('clock changes do not emit duplicate state, and observed seeks remain distinguishable', () => {
  assert.deepEqual(changedPlaybackEvents(snapshot, { ...snapshot, capturedAt: 200 }), []);
  assert.deepEqual(
    changedPlaybackEvents(snapshot, { ...snapshot, playing: true, positionMs: 5000 }, true),
    ['play', 'positionchange', 'seek', 'snapshot'],
  );
  assert.deepEqual(changedPlaybackEvents({ ...snapshot, playing: true }, snapshot), [
    'pause',
    'snapshot',
  ]);
  assert.deepEqual(
    changedPlaybackEvents(snapshot, { ...snapshot, muted: true, durationMs: null }),
    ['volumechange', 'durationchange', 'snapshot'],
  );
});

test('stable track metadata updates are distinct from identity changes and loss of media', () => {
  const first = { ...snapshot, track: { id: 'youtube:abcdefgh_-1', title: 'First' } };
  assert.deepEqual(
    changedPlaybackEvents(first, { ...first, track: { ...first.track, title: 'Corrected' } }),
    ['metadatachange', 'snapshot'],
  );
  assert.deepEqual(
    changedPlaybackEvents(first, { ...first, track: { id: 'youtube:123456789_-' } }),
    ['trackchange', 'metadatachange', 'snapshot'],
  );
  assert.deepEqual(changedPlaybackEvents(first, null), [
    'trackchange',
    'metadatachange',
    'durationchange',
    'snapshot',
  ]);
  assert.deepEqual(changedPlaybackEvents(null, null), []);
});

test('identity observation survives missing media and does not double count media readiness', () => {
  const metadata = { ...emptyMetadata, videoId: 'abcdefgh_-1', title: 'Song' };
  assert.deepEqual(changedPlaybackEvents(null, null, false, emptyMetadata, metadata), [
    'trackchange',
    'metadatachange',
    'snapshot',
  ]);
  assert.deepEqual(changedPlaybackEvents(null, snapshot, false, metadata, metadata), [
    'durationchange',
    'snapshot',
  ]);
  assert.deepEqual(
    changedPlaybackEvents(null, null, false, metadata, { ...metadata, title: 'Corrected' }),
    ['metadatachange', 'snapshot'],
  );
});
