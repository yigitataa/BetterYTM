# Codex Master Prompt

Use the repository specifications to implement **Better YTM** from start to finish.

## Mission

Build a production-quality Chrome Manifest V3 extension that enhances YouTube Music with:

- a restrained Liquid Glass visual system;
- multiple theme presets;
- a live Theme Studio;
- reversible layout and quality-of-life improvements;
- a real-time Listen Together room system;
- a typed YouTube Music adapter;
- robust tests and graceful degradation.

## Execution instructions

1. Read `AGENTS.md` and every file under `docs/` before coding.
2. Inspect `starter/` and preserve the intended workspace boundaries.
3. Implement according to `docs/11_IMPLEMENTATION_ROADMAP.md` in order.
4. After each phase, run typecheck, lint, unit tests, and relevant E2E tests.
5. Maintain a concise `IMPLEMENTATION_STATUS.md` with completed items, known limitations, selector health, and next phase.
6. Do not ask for product decisions already defined in the specs.
7. If YouTube Music DOM details cannot be known until runtime, build a selector-probing/diagnostic layer rather than inventing hidden APIs.
8. If a feature cannot safely work due to host-page behavior, implement a graceful fallback and document it.
9. Keep all external service endpoints configurable via environment variables.
10. Produce a final README with local development, unpacked installation, backend start, tests, and release steps.

## MVP outcome

At MVP completion a user must be able to:

- install the extension unpacked;
- open YouTube Music and see a stable Better YTM shell;
- choose among polished theme presets;
- customize glass strength, accent, radius, density, animation intensity, and ambience;
- save and restore theme preferences;
- open a Better YTM settings/Theme Studio surface;
- create a Listen Together room;
- share/join a room by code or link;
- see room participants;
- synchronize play, pause, seek, and track changes with reasonable drift correction;
- reconnect and restore the room state;
- disable Better YTM and return to the original YTM appearance without page damage.

## UI quality bar

Do not settle for a generic glassmorphism template. The design must feel like a cohesive music product:

- strong hierarchy;
- quiet base surfaces;
- glass only on elevated surfaces;
- artwork-driven ambient backgrounds;
- crisp typography;
- carefully tuned motion;
- stateful hover/press/focus behavior;
- tasteful depth and edge highlights;
- high contrast in lyrics and dense lists;
- consistent responsive behavior.

Use `prototype/` as a mood and interaction reference, not as final production code.
