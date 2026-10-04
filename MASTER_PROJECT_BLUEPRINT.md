# Better YTM — Master Project Blueprint

## 1. Product statement

Better YTM is a Chrome extension that makes YouTube Music feel more personal, premium, and social without replacing its core playback system. The visual direction blends YouTube Music familiarity with restrained Liquid Glass. Its flagship additions are a powerful theme engine and Listen Together rooms.

## 2. Core product modules

### 2.1 Visual enhancement layer

- Liquid Glass app shell
- refined side navigation
- top command bar
- improved content cards
- modernized album/playlist headers
- redesigned bottom player presentation
- expanded Now Playing view
- improved queue and lyrics presentation
- ambient artwork background
- motion and density controls

### 2.2 Theme Engine

- built-in presets
- token-based theme model
- live Theme Studio
- accent, surface, radius, blur, opacity, density, motion, ambience controls
- import/export JSON
- fallback-safe validation
- reversible CSS application

### 2.3 Listen Together

- create room
- join with room code/link
- participant presence
- host role
- play/pause sync
- seek sync
- track-change sync
- latency estimate
- drift correction
- reconnect + snapshot
- shared queue in post-MVP

## 3. Architecture

```text
better-ytm/
├─ apps/
│  ├─ extension/
│  │  ├─ src/background/
│  │  ├─ src/content/
│  │  ├─ src/ui/
│  │  ├─ src/options/
│  │  └─ public/
│  └─ server/
│     └─ src/
├─ packages/
│  ├─ shared/
│  ├─ ytm-adapter/
│  ├─ theme-engine/
│  ├─ sync-engine/
│  └─ ui/
├─ design/
├─ docs/
└─ tests/
```

## 4. Extension runtime boundaries

### Content layer

Responsibilities:

- observe current YTM page state;
- mount Better YTM UI roots;
- apply tokenized theme styles;
- call the YTM adapter;
- bridge user interactions to the service worker/sync client.

### Service worker

Responsibilities:

- extension lifecycle;
- persistent extension settings coordination when appropriate;
- runtime messaging;
- room connection lifecycle if WebSocket is hosted there;
- alarms/reconnect coordination where needed.

Do not assume persistence. The implementation must survive service-worker restart.

### Better YTM Shadow UI

Use Shadow DOM for extension-owned drawers, toasts, Theme Studio overlays, room panels, and diagnostics where possible. Host-page visual restyling remains a separate style layer.

## 5. Styling strategy

Use two layers:

### Host Theme Layer

A tokenized stylesheet targeting known YTM surfaces. It must be:

- scoped;
- reversible;
- low-specificity where possible;
- free of `!important` except documented compatibility cases;
- versioned by selector profile.

### Better YTM UI Layer

React components mounted inside an isolated Shadow DOM. This protects the extension UI from YouTube Music CSS and prevents accidental leakage back into the page.

## 6. Liquid Glass rules

Glass is reserved for elevated/interactive surfaces:

- sidebar dock
- top command bar
- bottom player container
- floating panels
- drawers
- modal surfaces
- compact chips and tooltips

Do not glassify large text-heavy lists. Dense playlists and lyrics need quiet, high-contrast backgrounds.

## 7. Design system summary

### Base tokens

```text
background.base      #080A0F
background.layer1    rgba(15,18,25,.76)
background.layer2    rgba(24,28,38,.68)
glass.fill           rgba(255,255,255,.065)
glass.fillStrong     rgba(255,255,255,.10)
glass.stroke         rgba(255,255,255,.12)
text.primary         rgba(255,255,255,.96)
text.secondary       rgba(255,255,255,.66)
text.muted           rgba(255,255,255,.46)
accent.default       #FF375F
```

### Radius

8 / 12 / 16 / 22 / 28px

### Blur

8 / 14 / 22 / 32px

### Motion

- micro: 120–180ms
- standard: 180–260ms
- panels: 260–360ms
- ambient crossfade: 450–700ms

Respect reduced motion.

## 8. Home screen

- floating sidebar
- compact top command bar
- large ambient hero
- horizontally scrollable content sections where YTM already uses shelves
- polished card hover with contextual play action
- no unnecessary card borders
- artwork is the strongest visual object

## 9. Player

Bottom player behaves as a floating dock visually while preserving YTM playback ownership.

Left: artwork + title + artist + like/more.

Center: playback controls + progress.

Right: lyrics + queue + Listen Together + volume + contextual actions.

The extension may reposition/present host controls or overlay Better YTM controls that delegate to `YTMAdapter`. It must not create a second audio engine.

## 10. Theme Studio

Theme Studio includes:

- preset gallery
- live preview
- accent picker
- surface brightness
- glass strength
- blur
- transparency
- border radius
- density
- motion intensity
- ambient background toggle/intensity
- artwork-driven accent toggle
- reset
- import/export

Theme changes update live and persist using `chrome.storage`.

## 11. Listen Together protocol

The server transports playback metadata/state only.

Minimum synchronized state:

```ts
interface PlaybackSnapshot {
  track: { videoId: string; title?: string; artist?: string } | null;
  playing: boolean;
  positionMs: number;
  durationMs?: number;
  serverTimeMs: number;
  revision: number;
}
```

Every client plays the track through its own YouTube Music session.

## 12. Sync algorithm

1. Establish room connection.
2. Take 5 ping samples.
3. Calculate median clock offset/RTT.
4. Receive authoritative snapshot.
5. If track differs, navigate/load through adapter.
6. Calculate expected position at current server time.
7. Apply play/pause.
8. Correct drift:
   - <=250ms: ignore;
   - 250–750ms: optional gentle correction / wait for next sync;
   - >750ms: seek to target;
   - after track load: allow larger temporary tolerance while buffering.
9. Periodically exchange state heartbeat.
10. Reconnect using snapshot, never by replaying old events.

## 13. MVP room permissions

Host controls playback by default.

Post-MVP options:

- everyone can control playback;
- everyone can add to queue;
- host-only queue changes;
- kick participant;
- transfer host.

## 14. YTM adapter contract

All host-page interaction goes through one adapter.

```ts
interface YTMAdapter {
  getHealth(): AdapterHealth;
  getPlaybackState(): PlaybackState | null;
  getCurrentTrack(): TrackIdentity | null;
  play(): Promise<AdapterResult>;
  pause(): Promise<AdapterResult>;
  seek(seconds: number): Promise<AdapterResult>;
  next(): Promise<AdapterResult>;
  previous(): Promise<AdapterResult>;
  openTrack(videoId: string): Promise<AdapterResult>;
  subscribe(listener: (event: YTMEvent) => void): () => void;
}
```

Never expose raw selectors to other packages.

## 15. DOM resilience

Selectors should prioritize:

1. semantic tags/IDs maintained by YTM;
2. accessible labels/roles;
3. stable component boundaries;
4. narrow structural fallback selectors.

Avoid generated class names when possible.

Each selector profile includes a health probe. If critical selectors fail, disable only the dependent enhancement and keep YTM usable.

## 16. Privacy/security

- no audio upload;
- no listening history sent to the backend beyond room state needed for current sync;
- room state should expire automatically;
- random opaque room IDs/tokens;
- rate limiting;
- validate every incoming WebSocket message;
- do not trust client role claims;
- do not store auth credentials in page DOM;
- no remote executable code;
- minimize extension permissions.

## 17. Testing

### Unit

- theme schema validation
- token generation
- storage migration
- protocol schema
- clock offset calculations
- drift logic
- revision ordering
- loop suppression

### Integration

- adapter against fixture DOM
- mount/unmount styles
- extension messaging
- WebSocket room lifecycle

### E2E

- extension loads on music.youtube.com
- theme persists across reload
- Theme Studio updates live
- room create/join
- two-page playback synchronization using controlled fixtures/mocks where direct host automation is unreliable
- reconnect snapshot
- disabling extension restores baseline presentation

## 18. Release gates

Before release:

- no remote code;
- no private YTM API dependency;
- no media URL extraction;
- no auth token collection;
- permissions audited;
- accessibility pass;
- selector health diagnostics pass;
- privacy policy matches actual telemetry/data handling;
- Chrome Web Store policy review;
- YouTube terms/compliance review for public distribution.
