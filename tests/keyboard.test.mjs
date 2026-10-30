import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/extension/package.json', import.meta.url));
const { build } = require('esbuild');
const compiled = await build({
  entryPoints: ['apps/extension/src/listen-together/keyboard.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { isolateRoomKeyboard } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);

test('room keys do not reach host shortcuts, retain native defaults, and release on unmount', () => {
  const view = new EventTarget();
  const host = { ownerDocument: { defaultView: view } };
  const release = isolateRoomKeyboard(host);
  const seen = [];
  for (const type of ['keydown', 'keypress', 'keyup'])
    view.addEventListener(type, () => seen.push(type));
  function key(type, inside) {
    const event = new Event(type, { cancelable: true });
    event.composedPath = () => (inside ? [{}, host, view] : [{}, view]);
    view.dispatchEvent(event);
    assert.equal(
      event.defaultPrevented,
      false,
      'Typing, clipboard, Tab, Enter and Escape keep browser defaults',
    );
  }
  for (const type of ['keydown', 'keypress', 'keyup']) key(type, true);
  assert.deepEqual(seen, []);
  key('keydown', false);
  assert.deepEqual(seen, ['keydown'], 'Host shortcuts outside the room still work');
  release();
  release();
  for (const type of ['keydown', 'keypress', 'keyup']) key(type, true);
  assert.deepEqual(seen, ['keydown', 'keydown', 'keypress', 'keyup']);
});
