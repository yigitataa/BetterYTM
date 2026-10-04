# AGENTS.md — Instructions for Codex

You are implementing **Better YTM** from the specifications in this repository.

## Priority order

When instructions conflict, follow this order:

1. Security, privacy, and platform constraints
2. Acceptance criteria
3. Architecture contracts
4. Product requirements
5. UI/UX specification
6. Implementation preferences

## Required working style

- Read the complete blueprint before making architectural choices.
- Work in small vertical slices that remain runnable.
- Prefer typed interfaces and pure functions around fragile DOM integration.
- Keep YouTube Music selectors in one package/module only.
- Never scatter raw selectors through React components or room logic.
- Keep extension-owned UI separate from host-page styling.
- Use feature flags for experimental functionality.
- Never silently swallow adapter failures; degrade gracefully and report diagnostic state.
- Every feature must have a disable/unmount path.
- Do not leave the project in a half-migrated state between phases.

## Prohibited implementation shortcuts

Do not:

- use undocumented/private YouTube Music HTTP APIs;
- inspect, copy, alter, or replay auth tokens/cookies;
- intercept media URLs or proxy/download audio;
- bypass ads, entitlements, region controls, DRM, or subscription checks;
- ship remotely hosted executable code;
- use `eval`, `new Function`, or equivalent dynamic JavaScript execution;
- make the entire UI dependent on brittle nth-child selectors;
- overwrite `document.body.innerHTML`;
- replace YouTube Music’s player with a custom audio player;
- put networking code directly inside visual components;
- let incoming room events echo back indefinitely as new local events.

## Chrome extension rules

- Use Manifest V3.
- Content scripts default to the isolated world.
- Request the minimum permissions required.
- Bundle executable extension code locally.
- Use `chrome.storage` for extension settings.
- Use extension messaging between the content layer and service worker where separation is needed.
- If a service-worker WebSocket is used, implement reconnect and keepalive according to current Chrome guidance.
- Do not assume the service worker is permanently alive.

## UI rules

- The design language is **YouTube Music familiarity + restrained Liquid Glass**.
- Do not make every surface transparent.
- Accessibility and readability override glass effects.
- Respect `prefers-reduced-motion`.
- Keyboard navigation and visible focus are mandatory.
- The extension must remain usable at 100%, 125%, and 150% browser scaling.
- All Better YTM-owned UI must work on common laptop widths before polishing ultra-wide layouts.

## Adapter rules

The rest of the application may only access YouTube Music through the `YTMAdapter` contract.

If selectors change, fix the adapter, not every feature.

Adapter methods must return typed success/failure results where failure is expected.

## Listen Together rules

- Synchronize **state**, never audio bytes.
- Users play audio from their own YouTube Music sessions.
- Server state is authoritative for room membership and revisions.
- Playback authority follows room permissions; host authority is the MVP default.
- Every event includes `eventId`, `roomId`, `originClientId`, `sentAt`, and monotonic `revision` when applicable.
- Remote operations must be loop-suppressed.
- Reconnect must request a complete room snapshot.

## Definition of done for each phase

A phase is complete only when:

1. Type checking passes.
2. Linting passes.
3. Unit tests for new logic pass.
4. Existing tests still pass.
5. The extension can be loaded unpacked in Chrome.
6. Feature can be disabled without leaving stale DOM/CSS/listeners.
7. Relevant acceptance criteria have automated coverage where practical.

## When the host page changes

If YouTube Music DOM changes:

1. Detect adapter health failure.
2. Disable only affected enhancements.
3. Keep unrelated features running.
4. Surface a non-intrusive diagnostic notice in Better YTM settings.
5. Never enter a mutation/reload loop.
