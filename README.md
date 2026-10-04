# Better YTM

YouTube Music familiarity with restrained Liquid Glass, customizable themes, and state-only Listen Together. This repository currently implements **Phase 0 — Repository Foundation**. Themes, adapter controls, extension settings, React/Shadow DOM UI, and rooms are not implemented yet.

## Requirements

- Node.js 22.21+ on the 22.x line, or Node.js 24.10+.
- pnpm 12.5.1, pinned in `package.json`.
- Chrome 111 or newer for manual unpacked-extension checks.

## Local development

Run all commands from the repository root:

```sh
pnpm install
pnpm dev
```

`pnpm dev` runs both application workspaces concurrently. The extension watcher writes files to `apps/extension/dist`; the server restarts when its TypeScript source changes. Extension code is bundled locally, without a remote development runtime or automatic browser interactions.

To run them separately:

```sh
pnpm dev:extension
pnpm dev:server
```

The server defaults to `127.0.0.1:8787`. Optionally copy `apps/server/.env.example` to `apps/server/.env` and edit `HOST`/`PORT`. Dev and production start commands read that file relative to the server workspace. Existing environment variables take precedence.

## Build and code checks

```sh
pnpm typecheck
pnpm build
pnpm lint
```

`pnpm lint` runs ESLint and checks formatting. `pnpm format` applies Prettier to implementation files. Original specifications and the reference prototype are excluded from formatting.

Build outputs:

- `apps/extension/dist`: unpacked Chrome extension with Manifest V3 and local content/background bundles.
- `apps/server/dist`: compiled Node.js server.
- `packages/shared/dist`: shared contracts and TypeScript declarations.

Start the compiled server after building:

```sh
pnpm start:server
```

`GET http://127.0.0.1:8787/health` returns status `200` and:

```json
{ "status": "ok", "service": "better-ytm-server" }
```

`HEAD /health` is supported; other methods return `405`, and unknown paths return `404`. No WebSocket or room backend is implemented in Phase 0.

## Manual unpacked installation

1. Run `pnpm build` (or keep `pnpm dev:extension` running).
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select `apps/extension/dist`.
4. Open or refresh `https://music.youtube.com/`.
5. In DevTools Console, find `[Better YTM] Content script ready (v0.0.1).`.

The content script runs at `document_idle` in the isolated world, only on the declared YouTube Music origin. The stateless background worker logs installation/update lifecycle events. No extra permissions are requested in Phase 0. There are no host selectors, DOM mutations, styles, playback changes, settings, or network requests in the extension yet.

After source changes, wait for the watcher build, reload the extension in `chrome://extensions`, then refresh YouTube Music. Public assets are copied on changes; package metadata changes require restarting the watcher. Disabling the extension stops new script injection. The Phase 0 script creates no DOM, CSS, timers, or page listeners that require cleanup.

All functional and browser testing is manual for this task. No E2E, Playwright, automatic UI interactions, or new test suite is included.

## Repository layout

```text
apps/
  extension/
    public/manifest.json
    scripts/build.mjs
    src/background/
    src/content/
  server/
    src/index.ts
packages/
  shared/
prototype/
  index.html
```

The original root `index.html` is preserved under `prototype/` as reference material. Its linked `styles.css` was absent in the input repository, so it is not a working application or build input.

Read `AGENTS.md` and `MASTER_PROJECT_BLUEPRINT.md` for architecture constraints, and `IMPLEMENTATION_STATUS.md` for phase status. The supplied repository did not include the referenced `docs/11_IMPLEMENTATION_ROADMAP.md`, `docs/12_ACCEPTANCE_CRITERIA.md`, or `starter/`; Phase 0 is based on the user's explicit scope and the available blueprint. The original README was also absent and this file supplies the development instructions.
