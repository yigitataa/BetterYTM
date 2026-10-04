import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultSettings,
  mergeSettings,
  migrateSettings,
  settingsSchema,
} from '../packages/shared/dist/index.js';
import {
  applyTheme,
  resolveTheme,
  THEME_PRESETS,
  themeToTokens,
} from '../packages/theme-engine/dist/index.js';

test('missing settings initialize once, with independent default objects', () => {
  const migrated = migrateSettings(undefined);
  assert.equal(migrated.shouldPersist, true);
  assert.equal(migrated.settings.theme.presetId, 'midnight-glass');
  assert.equal(migrateSettings(migrated.settings).shouldPersist, false);
  migrated.settings.theme.overrides.radius = 12;
  assert.deepEqual(createDefaultSettings().theme.overrides, {});
});

test('legacy and incomplete records preserve known user preferences', () => {
  const legacy = migrateSettings({ schemaVersion: 0, enabled: false, themeId: 'graphite' });
  assert.equal(legacy.status, 'migrated');
  assert.equal(legacy.settings.enabled, false);
  assert.equal(legacy.settings.theme.presetId, 'graphite');
  const partial = migrateSettings({ schemaVersion: 1, theme: { presetId: 'warm-night' } });
  assert.equal(partial.status, 'repaired');
  assert.equal(partial.settings.theme.presetId, 'warm-night');
});

test('bad fields are repaired individually and unsafe CSS values rejected', () => {
  const result = migrateSettings({
    schemaVersion: 1,
    enabled: true,
    theme: {
      presetId: 'graphite',
      overrides: { radius: 16, accent: 'url(https://invalid)', glassBlur: Infinity },
    },
  });
  assert.deepEqual(result.settings.theme.overrides, { radius: 16 });
  assert.equal(result.diagnostics.length, 2);
  assert.equal(
    settingsSchema.safeParse({ ...createDefaultSettings(), enabled: 'false' }).success,
    false,
  );
});

test('future versions disable enhancement and leave stored data untouched', () => {
  const source = { schemaVersion: 99, theme: { special: 'keep' } };
  const copy = structuredClone(source);
  const result = migrateSettings(source);
  assert.equal(result.status, 'future-version');
  assert.equal(result.shouldPersist, false);
  assert.equal(result.settings.enabled, false);
  assert.deepEqual(source, copy);
});

test('updates merge overrides; changing preset clears previous overrides', () => {
  const selected = mergeSettings(createDefaultSettings(), { theme: { overrides: { radius: 12 } } });
  const updated = mergeSettings(selected, { theme: { overrides: { accent: '#123456' } } });
  assert.deepEqual(updated.theme.overrides, { radius: 12, accent: '#123456' });
  const switched = mergeSettings(updated, { theme: { presetId: 'graphite' } });
  assert.deepEqual(switched.theme.overrides, {});
  assert.equal(updated.theme.presetId, 'midnight-glass');
});

test('every preset resolves; default tokens retain blueprint values', () => {
  for (const preset of THEME_PRESETS) {
    const theme = resolveTheme({ presetId: preset.id, overrides: {} });
    assert.equal(themeToTokens(theme)['--bytm-accent'], preset.config.accent);
  }
  const tokens = themeToTokens(resolveTheme(createDefaultSettings().theme));
  assert.equal(tokens['--bytm-background-base'], 'rgb(8, 10, 15)');
  assert.equal(tokens['--bytm-glass-fill'], 'rgba(255, 255, 255, 0.065)');
  assert.equal(tokens['--bytm-radius-4'], '22px');
  assert.equal(tokens['--bytm-blur-3'], '22px');
});

test('system reduced motion overrides expressive motion and ambience', () => {
  const theme = resolveTheme({
    presetId: 'warm-night',
    overrides: { motion: 'expressive', ambienceEnabled: true, ambienceIntensity: 1 },
  });
  assert.equal(themeToTokens(theme)['--bytm-motion-panel'], '360ms');
  const reduced = themeToTokens(theme, true);
  assert.equal(reduced['--bytm-motion-panel'], '0ms');
  assert.equal(reduced['--bytm-ambience-intensity'], '0');
});

test('theme disposal restores originals and removes its motion listener', () => {
  // Plain in-memory style/media stubs; no browser or DOM automation.
  const properties = new Map([['--bytm-accent', { value: '#ABCDEF', priority: 'important' }]]);
  let hasStyleAttribute = true;
  const listeners = new Set();
  const document = {
    documentElement: {
      hasAttribute: () => hasStyleAttribute,
      removeAttribute: () => {
        hasStyleAttribute = false;
      },
      style: {
        get length() {
          return properties.size;
        },
        getPropertyValue: (key) => properties.get(key)?.value ?? '',
        getPropertyPriority: (key) => properties.get(key)?.priority ?? '',
        setProperty: (key, value, priority = '') => {
          hasStyleAttribute = true;
          properties.set(key, { value, priority });
        },
        removeProperty: (key) => properties.delete(key),
      },
    },
    defaultView: {
      matchMedia: () => ({
        matches: false,
        addEventListener: (_, listener) => listeners.add(listener),
        removeEventListener: (_, listener) => listeners.delete(listener),
      }),
    },
  };
  const applied = applyTheme(document, resolveTheme(createDefaultSettings().theme));
  applied.update(resolveTheme({ presetId: 'graphite', overrides: {} }));
  applied.dispose();
  applied.dispose();
  assert.equal(listeners.size, 0);
  assert.deepEqual(
    [...properties],
    [['--bytm-accent', { value: '#ABCDEF', priority: 'important' }]],
  );
  properties.clear();
  hasStyleAttribute = false;
  const fresh = applyTheme(document, resolveTheme(createDefaultSettings().theme));
  fresh.dispose();
  assert.equal(properties.size, 0);
  assert.equal(hasStyleAttribute, false);
});
