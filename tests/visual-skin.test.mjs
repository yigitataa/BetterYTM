import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyVisualSkin,
  compareLayouts,
  resolveTheme,
  VISUAL_SKIN_RULES,
} from '../packages/theme-engine/dist/index.js';
import { compileVisualSkin, PAINT_PROPERTIES } from '../packages/ytm-adapter/dist/visual-styles.js';
import { HOST_COLOR_VARIABLES, VISUAL_SELECTORS } from '../packages/ytm-adapter/dist/selectors.js';

test('one continuous app canvas replaces finite native browse backgrounds', () => {
  const background = VISUAL_SKIN_RULES.find(({ target }) => target === 'browseBackground');
  assert.equal(background.declarations['background-color'], 'transparent');
  assert.equal(background.declarations['background-image'], 'none');
  assert.ok(background.important.includes('background-color'));
  assert.ok(background.important.includes('background-image'));
  assert.ok(
    VISUAL_SELECTORS.browseBackground.some((selector) =>
      selector.includes('.immersive-background'),
    ),
  );
  const gradients = VISUAL_SKIN_RULES.filter(
    ({ target, declarations }) =>
      ['canvas', 'ambientCanvas', 'content', 'browseBackground'].includes(target) &&
      declarations['background-image'] !== 'none' &&
      declarations['background-image'],
  );
  assert.equal(gradients.length, 1);
  assert.equal(gradients[0].target, 'ambientCanvas');
  assert.equal(gradients[0].declarations['background-attachment'], 'fixed');
  assert.equal(gradients[0].declarations['background-repeat'], 'no-repeat');
});

test('all shipped host declarations are paint-only; only guarded decoration has positioning', () => {
  const css = compileVisualSkin(VISUAL_SKIN_RULES);
  assert.doesNotMatch(css, /--bytm-(space|density|motion)-|nth-child|\burl\s*\(/);
  let decoration = 0;
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const properties = [...body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map((match) => match[1]);
    if (selector.endsWith('::before ')) {
      decoration++;
      assert.match(selector, /data-bytm-glass="phase-3"/);
      assert.match(body, /position: absolute !important/);
      assert.match(body, /pointer-events: none !important/);
      assert.doesNotMatch(body, /\b(width|height|margin|padding|transform|transition)\s*:/);
    } else
      for (const property of properties)
        assert.ok(
          PAINT_PROPERTIES.includes(property) || Object.hasOwn(HOST_COLOR_VARIABLES, property),
          property,
        );
  }
  assert.equal(decoration, 1);
});

test('compiler rejects layout, remote resources, declaration injection and unknown targets', () => {
  for (const property of [
    'width',
    'height',
    'padding',
    'gap',
    'display',
    'position',
    'transform',
    'font-size',
    'line-height',
    'border-width',
    'border-style',
    'backdrop-filter',
    'filter',
    'transition',
    '--ytmusic-size',
  ]) {
    assert.throws(
      () => compileVisualSkin([{ target: 'card', declarations: { [property]: '1px' } }]),
      /Non-paint/,
    );
  }
  for (const value of [
    'red; padding: 10px',
    'url(https://example.com/file)',
    'red } body {',
    'red !important',
  ])
    assert.throws(
      () => compileVisualSkin([{ target: 'card', declarations: { color: value } }]),
      /Unsafe/,
    );
  assert.throws(
    () => compileVisualSkin([{ target: 'not-mapped', declarations: { color: 'red' } }]),
    /Unknown/,
  );
});

const sample = {
  identity: 1,
  box: { x: 10, y: 20, width: 200, height: 40 },
  scroll: {
    clientWidth: 200,
    clientHeight: 40,
    scrollWidth: 200,
    scrollHeight: 40,
    scrollLeft: 0,
    scrollTop: 0,
  },
  typography: {
    fontFamily: 'native',
    fontSize: '14px',
    lineHeight: '20px',
    letterSpacing: 'normal',
  },
  textRects: [{ x: 15, y: 25, width: 120, height: 20 }],
  textFingerprint: 123,
};
const snapshot = {
  capturedAt: 1,
  viewport: { width: 1200, height: 800, pixelRatio: 1, scrollX: 0, scrollY: 0 },
  regions: Object.fromEntries(
    [
      'sidebar',
      'navigation',
      'search',
      'content',
      'card',
      'row',
      'player',
      'artwork',
      'controls',
    ].map((region) => [region, structuredClone(sample)]),
  ),
};

test('comparison checks exact boxes, typography, wrapping and scroll; tolerance is explicit', () => {
  assert.equal(compareLayouts(snapshot, structuredClone(snapshot)).status, 'unchanged');
  const after = structuredClone(snapshot);
  after.regions.card.box.x += 0.005;
  assert.equal(compareLayouts(snapshot, after).status, 'changed');
  assert.equal(compareLayouts(snapshot, after, 0.01).status, 'unchanged');
  after.regions.row.textRects.push({ ...sample.textRects[0], y: 45 });
  after.regions.player.scroll.scrollHeight++;
  after.regions.search.typography.fontSize = '15px';
  const result = compareLayouts(snapshot, after, 0.01);
  assert.equal(result.status, 'changed');
  assert.ok(result.regions.row.differences.includes('text wrapping/fragment geometry'));
  assert.ok(result.regions.player.differences.includes('scroll.scrollHeight'));
  assert.ok(result.regions.search.differences.includes('typography.fontSize'));
  assert.throws(() => compareLayouts(snapshot, after, Infinity), /tolerance/);
});

test('missing, replaced, changing host content or viewport never produce complete acceptance', () => {
  const before = structuredClone(snapshot);
  before.regions.row = null;
  const after = structuredClone(before);
  const partial = compareLayouts(before, after);
  assert.equal(partial.complete, false);
  assert.equal(partial.regions.row.status, 'unavailable');
  after.regions.card.identity++;
  assert.equal(compareLayouts(before, after).status, 'inconclusive');
  after.regions.card.identity--;
  after.regions.card.textFingerprint++;
  assert.equal(compareLayouts(before, after).status, 'inconclusive');
  after.viewport.width++;
  assert.equal(compareLayouts(before, after).environmentChanged, true);
});

test('skin updates reuse one sheet; duplicate initialization and disposal restore owned state', () => {
  // Plain in-memory ownership stubs, not browser tests or UI interaction.
  const attrs = new Map([['data-bytm-theme', 'prior-owner']]);
  const properties = new Map([['--bytm-accent', { value: '#abcdef', priority: 'important' }]]);
  const sheets = new Set();
  const listeners = new Set();
  const document = {
    documentElement: {
      getAttribute: (name) => attrs.get(name) ?? null,
      setAttribute: (name, value) => attrs.set(name, value),
      hasAttribute: (name) => attrs.has(name),
      removeAttribute: (name) => attrs.delete(name),
      style: {
        get length() {
          return properties.size;
        },
        getPropertyValue: (key) => properties.get(key)?.value ?? '',
        getPropertyPriority: (key) => properties.get(key)?.priority ?? '',
        setProperty: (key, value, priority = '') => {
          attrs.set('style', '');
          properties.set(key, { value, priority });
        },
        removeProperty: (key) => properties.delete(key),
      },
    },
    head: { append: (sheet) => sheets.add(sheet) },
    createElement: () => {
      const sheet = { remove: () => sheets.delete(sheet) };
      return sheet;
    },
    defaultView: {
      matchMedia: () => ({
        matches: false,
        addEventListener: (_, listener) => listeners.add(listener),
        removeEventListener: (_, listener) => listeners.delete(listener),
      }),
    },
  };
  const first = applyVisualSkin(
    document,
    resolveTheme({ presetId: 'graphite', overrides: {} }),
    'paint',
  );
  const sheet = [...sheets][0];
  first.update(resolveTheme({ presetId: 'warm-night', overrides: {} }));
  assert.equal([...sheets][0], sheet);
  first.setVisible(false);
  assert.equal(attrs.get('data-bytm-enabled'), 'false');
  first.setVisible(true);
  const second = applyVisualSkin(
    document,
    resolveTheme({ presetId: 'midnight-glass', overrides: {} }),
    'paint',
  );
  assert.equal(sheets.size, 1);
  assert.equal(listeners.size, 1);
  assert.throws(() => first.setVisible(true), /disposed/);
  second.dispose();
  second.dispose();
  assert.equal(sheets.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(attrs.get('data-bytm-theme'), 'prior-owner');
  assert.equal(attrs.has('data-bytm-enabled'), false);
  assert.deepEqual(
    [...properties],
    [['--bytm-accent', { value: '#abcdef', priority: 'important' }]],
  );
});
