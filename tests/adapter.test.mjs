import assert from 'node:assert/strict';
import test from 'node:test';
import { changedPlaybackEvents } from '../packages/ytm-adapter/dist/events.js';
import {
  safeArtworkUrl,
  trackFromMetadata,
  videoIdFromWatchLink,
  watchUrlForVideoId,
} from '../packages/ytm-adapter/dist/metadata.js';
import {
  canSeek,
  finiteMilliseconds,
  seekablePosition,
  seekMedia,
} from '../packages/ytm-adapter/dist/player.js';

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

test('native media seeking works without a slider and while the player UI is inert or hidden', () => {
  const media = {
    isConnected: true,
    readyState: 4,
    error: null,
    duration: 180,
    currentTime: 0,
    seekable: { length: 1, start: () => 0, end: () => 180 },
  };
  const control = {
    parentElement: null,
    hasAttribute: (name) => ['inert', 'hidden'].includes(name),
    getAttribute: () => null,
  };
  for (const slider of [null, control]) {
    assert.equal(canSeek(media, slider), true);
    assert.deepEqual(seekMedia(media, slider, 73.25), { ok: true });
    assert.equal(media.currentTime, 73.25);
  }
  const disabled = { ...control, hasAttribute: (name) => name === 'disabled' };
  assert.equal(canSeek(media, disabled), false);
  assert.equal(seekMedia(media, disabled, 30).error.code, 'control-disabled');
  assert.equal(seekMedia(media, null, 181).error.code, 'invalid-argument');
  assert.equal(
    seekMedia({ ...media, seekable: { length: 0 } }, null, 30).error.code,
    'unavailable',
  );
  assert.equal(media.currentTime, 73.25);
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

test('track end is a distinct event before native autoplay can replace the song', () => {
  const ended = { ...snapshot, ended: true, playing: false, positionMs: snapshot.durationMs };
  const events = changedPlaybackEvents(snapshot, ended);
  assert.ok(events.includes('ended'));
  assert.ok(!changedPlaybackEvents(ended, ended).includes('ended'));
});
