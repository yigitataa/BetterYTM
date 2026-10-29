import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationDestination } from '../packages/ytm-adapter/dist/navigation.js';
import { compileVisualSkin } from '../packages/ytm-adapter/dist/visual-styles.js';
import { VISUAL_SELECTORS } from '../packages/ytm-adapter/dist/selectors.js';
import { VISUAL_SKIN_RULES } from '../packages/theme-engine/dist/index.js';

test('native Turkish and English primary labels map to public routes without matching playlist names', () => {
  for (const [label, path] of [
    ['Ana Sayfa', '/'],
    ['ANA SAYFA', '/'],
    ['  Ana   sayfa ', '/'],
    ['Home', '/'],
    ['Keşfet', '/explore'],
    ['KEŞFET', '/explore'],
    ['Explore', '/explore'],
    ['Kitaplık', '/library'],
    ['KİTAPLIK', '/library'],
    ['Library', '/library'],
  ]) {
    assert.equal(navigationDestination(label)?.path, path, label);
  }
  for (const label of [
    'Ana sayfa favorilerim',
    'Keşfet listem',
    'New playlist',
    'Beğendiğim müzikler',
    '',
  ])
    assert.equal(navigationDestination(label), undefined);
});

test('only verified decorative fullbleed layers can be hidden; foreground artwork stays intact', () => {
  const rule = VISUAL_SKIN_RULES.find(({ target }) => target === 'browseArtworkBackground');
  assert.equal(rule.declarations.opacity, '0');
  assert.ok(rule.important.includes('opacity'));
  assert.ok(
    VISUAL_SELECTORS.browseArtworkBackground.some((selector) =>
      selector.includes('ytmusic-immersive-carousel-shelf-renderer'),
    ),
  );
  for (const selector of VISUAL_SELECTORS.browseArtworkBackground)
    assert.match(
      selector,
      /> (?:#background|ytmusic-fullbleed-thumbnail-renderer)\.immersive-background$/,
    );
  const css = compileVisualSkin(VISUAL_SKIN_RULES);
  assert.match(css, /opacity: 0 !important/);
  assert.throws(
    () => compileVisualSkin([{ target: 'cardArtwork', declarations: { opacity: '0' } }]),
    /decorative/,
  );
  assert.throws(
    () =>
      compileVisualSkin([{ target: 'browseArtworkBackground', declarations: { opacity: '0.5' } }]),
    /decorative/,
  );
});
