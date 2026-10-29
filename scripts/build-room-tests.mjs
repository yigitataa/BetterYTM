import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/extension/package.json', import.meta.url));
const { build } = require('esbuild');
await build({
  entryPoints: [
    'apps/extension/src/listen-together/controller.ts',
    'apps/extension/src/background/rooms.ts',
  ],
  outdir: '.test-build',
  outbase: 'apps/extension/src',
  bundle: true,
  platform: 'node',
  format: 'esm',
  conditions: ['source'],
  target: 'node22',
  logLevel: 'warning',
});
