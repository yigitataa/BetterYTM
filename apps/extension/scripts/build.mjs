import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const outdir = fileURLToPath(new URL('../dist/', import.meta.url));
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const watchMode = process.argv.includes('--watch');

async function copyPublicFiles() {
  await cp(publicDir, outdir, { recursive: true });
  const manifestPath = `${outdir}/manifest.json`;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  manifest.version = pkg.version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await copyPublicFiles();

const options = {
  absWorkingDir: root,
  entryPoints: {
    content: 'src/content/index.ts',
    background: 'src/background/index.ts',
  },
  outdir,
  bundle: true,
  conditions: ['source'],
  splitting: false,
  format: 'iife',
  platform: 'browser',
  target: 'chrome116',
  sourcemap: watchMode ? 'external' : false,
  minify: !watchMode,
  logLevel: 'info',
};

if (watchMode) {
  const builder = await context(options);
  await builder.watch();
  const publicWatcher = watch(publicDir, { recursive: true }, () => {
    void copyPublicFiles().catch((error) => {
      console.error('[Better YTM] Could not copy extension assets:', error);
      process.exitCode = 1;
    });
  });

  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    publicWatcher.close();
    await builder.dispose();
    process.exit();
  }

  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  console.info('[Better YTM] Watching extension. Reload it in Chrome after changes.');
} else {
  await build(options);
}
