import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTheme,
  extractArtworkPalette,
  observeArtworkPalette,
  resolveTheme,
  themeToTokens,
  themeWithArtwork,
} from '../packages/theme-engine/dist/index.js';

const pixels = (...colors) =>
  Uint8ClampedArray.from(
    colors.flatMap(([rgb, count]) => Array.from({ length: count }, () => [...rgb, 255]).flat()),
  );
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex) =>
  rgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const base = () => resolveTheme({ presetId: 'midnight-glass', overrides: {} });
const ocean = pixels([[14, 98, 140], 150], [[12, 138, 129], 50]);
const warm = pixels([[184, 66, 22], 150], [[180, 133, 55], 50]);

test('covers produce distinct, legible tonal palettes rather than image backgrounds', () => {
  const blue = extractArtworkPalette(ocean);
  const orange = extractArtworkPalette(warm);
  assert.ok(rgb(blue.accent)[2] > rgb(blue.accent)[0] + 30);
  assert.ok(rgb(orange.accent)[0] > rgb(orange.accent)[2] + 30);
  assert.notEqual(blue.ambience, blue.accent);
  for (const palette of [blue, orange]) {
    for (const surface of ['background', 'surface', 'surfaceElevated']) {
      assert.ok(1.05 / (luminance(palette[surface]) + 0.05) > 10, surface);
      assert.ok(
        (luminance(palette.accent) + 0.05) / (luminance(palette[surface]) + 0.05) > 6,
        surface,
      );
    }
    assert.ok(luminance(palette.surface) > luminance(palette.background));
    const tokens = themeToTokens(themeWithArtwork(base(), palette));
    assert.equal(tokens['--bytm-accent'], palette.accent);
    assert.doesNotMatch(JSON.stringify(tokens), /url\(/);
  }
});

test('white margins do not dominate color; grayscale/transparent/missing artwork is stable', () => {
  const palette = extractArtworkPalette(pixels([[255, 255, 255], 900], [[14, 98, 140], 100]));
  assert.ok(rgb(palette.accent)[2] > rgb(palette.accent)[0] + 30);
  for (const value of [0, 127, 255]) {
    const neutral = extractArtworkPalette(pixels([[value, value, value], 20]));
    for (const color of Object.values(neutral)) assert.equal(new Set(rgb(color)).size, 1);
  }
  assert.equal(extractArtworkPalette(new Uint8ClampedArray(16)), null);
  assert.equal(extractArtworkPalette([]), null);
  const theme = base();
  assert.equal(themeWithArtwork(theme, null), theme);
  theme.config.artworkAccent = false;
  assert.equal(themeWithArtwork(theme, palette), theme);
});

function imageDocument() {
  const images = [];
  let denyCanvas = false;
  class Image {
    naturalWidth = 48;
    naturalHeight = 48;
    constructor() {
      images.push(this);
    }
    removeAttribute() {
      this.src = '';
    }
  }
  const document = {
    defaultView: { Image },
    createElement: () => ({
      getContext: () => ({
        drawImage: () => {
          if (denyCanvas) throw new Error('SecurityError');
        },
        getImageData: () => ({ data: ocean }),
      }),
    }),
  };
  return {
    document,
    images,
    deny: () => {
      denyCanvas = true;
    },
  };
}

test('rapid track changes discard stale loads; repeated artwork uses bounded cache; disposal cancels', () => {
  const { document, images } = imageDocument();
  const applied = [];
  const loader = observeArtworkPalette(document, (palette) => applied.push(palette));
  loader.update('https://example.com/a.jpg');
  const stale = images[0].onload;
  assert.equal(images[0].crossOrigin, 'anonymous');
  loader.update('https://example.com/b.jpg');
  assert.equal(images[0].onload, null);
  stale();
  assert.equal(applied.length, 0);
  images[1].onload();
  assert.equal(applied.length, 1);
  loader.update('https://example.com/b.jpg');
  assert.equal(images.length, 2);
  loader.update(null);
  assert.equal(applied.at(-1), null);
  loader.update('https://example.com/b.jpg');
  assert.equal(images.length, 2);
  assert.ok(applied.at(-1));
  loader.update('https://example.com/c.jpg');
  const pending = images[2].onload;
  loader.dispose();
  const count = applied.length;
  pending();
  assert.equal(applied.length, count);
  assert.equal(images[2].onload, null);
});

test('CORS, image errors and timeout fall back without interrupting playback', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = imageDocument();
  const applied = [];
  const loader = observeArtworkPalette(fixture.document, (palette) => applied.push(palette));
  loader.update('https://example.com/a.jpg');
  fixture.images[0].onerror();
  loader.update('https://example.com/b.jpg');
  fixture.deny();
  fixture.images[1].onload();
  loader.update('https://example.com/c.jpg');
  t.mock.timers.tick(6000);
  assert.deepEqual(applied, [null, null, null]);
  assert.equal(fixture.images[2].onload, null);
  loader.dispose();
});

test('palette transitions can be interrupted, respect reduced motion and restore state on disposal', () => {
  const values = new Map();
  const frames = new Map();
  let frameId = 0;
  let onMotionChange;
  const media = {
    matches: false,
    addEventListener: (_, listener) => {
      onMotionChange = listener;
    },
    removeEventListener: () => {},
  };
  const document = {
    documentElement: {
      hasAttribute: () => false,
      removeAttribute: () => {},
      style: {
        get length() {
          return values.size;
        },
        getPropertyValue: (name) => values.get(name) ?? '',
        getPropertyPriority: () => '',
        setProperty: (name, value) => values.set(name, value),
        removeProperty: (name) => values.delete(name),
      },
    },
    defaultView: {
      matchMedia: () => media,
      requestAnimationFrame: (callback) => {
        frames.set(++frameId, callback);
        return frameId;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
    },
  };
  const tick = (time) => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  };
  const applied = applyTheme(document, base());
  const blue = themeWithArtwork(base(), extractArtworkPalette(ocean));
  const orange = themeWithArtwork(base(), extractArtworkPalette(warm));
  applied.update(blue);
  tick(0);
  tick(120);
  const halfway = values.get('--bytm-accent');
  assert.notEqual(halfway, blue.config.accent);
  const channels = halfway
    .match(/[\d.]+/g)
    .slice(0, 3)
    .map(Number);
  const initial = rgb(base().config.accent);
  const target = rgb(blue.config.accent);
  const distance = (a, b) => a.reduce((sum, channel, i) => sum + Math.abs(channel - b[i]), 0);
  // The new cover is already clearly visible after 120ms; easing has no slow lead-in.
  assert.ok(distance(channels, target) < distance(initial, target) * 0.65);
  assert.match(values.get('--bytm-accent-rgb'), /^\d+, \d+, \d+$/);
  applied.update(orange);
  assert.equal(frames.size, 1);
  tick(300);
  assert.equal(values.get('--bytm-accent'), halfway);
  tick(1020);
  assert.equal(values.get('--bytm-accent'), orange.config.accent);
  applied.update(blue);
  media.matches = true;
  onMotionChange();
  assert.equal(frames.size, 0);
  assert.equal(values.get('--bytm-accent'), blue.config.accent);
  media.matches = false;
  applied.update(orange);
  assert.equal(frames.size, 1);
  applied.dispose();
  assert.equal(values.size, 0);
  assert.equal(frames.size, 0);
});
