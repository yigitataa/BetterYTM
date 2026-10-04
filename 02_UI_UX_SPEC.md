# 02 — UI/UX Specification

## Design concept

**YouTube Music familiarity × Liquid Glass ambient UI**

The interface should feel like a plausible premium evolution of YouTube Music, not an unrelated desktop app layered on top.

## Experience principles

### Familiarity

Navigation labels and fundamental content organization remain recognizable. Do not move essential playback functions into surprising locations merely for aesthetics.

### Calm depth

Depth comes from translucent layers, edge highlights, ambient shadows, and motion. Avoid excessive borders and noisy gradients.

### Music first

Artwork is visually dominant. UI decoration must not compete with album art, titles, lyrics, or playback controls.

### Progressive disclosure

Advanced settings live inside Theme Studio. The main interface exposes only high-frequency actions.

## Desktop layout

```text
┌─────────────────────────────────────────────────────────────────────┐
│                  floating / translucent top bar                    │
├──────────────┬───────────────────────────────────────┬──────────────┤
│              │                                       │ contextual   │
│ sidebar dock │              content                  │ drawer       │
│              │                                       │ (optional)   │
│              │                                       │              │
├──────────────┴───────────────────────────────────────┴──────────────┤
│                         floating player dock                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Layout behavior

### >= 1440px

- expanded sidebar by default;
- content max width may breathe rather than stretch every shelf edge-to-edge;
- contextual drawer can coexist with content.

### 1024–1439px

- narrower sidebar;
- contextual drawer overlays instead of permanently consuming width;
- lower card density.

### <1024px desktop window

- compact sidebar allowed;
- preserve player controls and search first;
- hide decorative ambience before hiding functional content.

## Sidebar

- floating glass dock feeling;
- active item uses subtle elevated fill, not a saturated block;
- icon + label spacing generous enough for 125–150% scaling;
- collapse animation uses width + opacity, not abrupt reflow;
- Theme Studio and Listen Together are Better YTM-specific entries separated visually from core YTM navigation.

## Top command bar

Contains where available:

- back/forward;
- search entry;
- current context title when useful;
- quick Listen Together state;
- profile/avatar passthrough.

Search uses a capsule/glass field but must maintain strong text contrast.

## Home

### Hero

A low-frequency hero surface near the top may use:

- current/recent artwork;
- heavily blurred ambient background;
- clear track/mix metadata;
- one primary action;
- optional quick-resume behavior delegated to YTM.

### Shelves/cards

- artwork remains square unless YTM source content is not square;
- card text alignment remains simple;
- hover reveals action affordance without shifting layout;
- avoid permanent glass rectangles around every card;
- hover surface may brighten by 2–4% with a subtle edge highlight.

## Playlist / album page

Header:

- artwork left or centered based on available host layout;
- metadata stays high contrast;
- ambient gradient/glow derived from artwork where available;
- actions remain visually grouped;
- scroll transition may compress the header into the top command bar.

Track list:

- dark quiet surface;
- light hover row;
- selected/current track gets accent indicator + subtle glow;
- no blur behind every row;
- clear column hierarchy.

## Player dock

Visual form:

- floating rounded dock on supported widths;
- strong enough surface opacity to remain readable over artwork ambience;
- thin edge highlight;
- subtle shadow;
- controls visually stable when track metadata changes.

Regions:

### Left

Artwork, title, artist, like/more.

### Center

Previous, play/pause, next, progress, time.

### Right

Lyrics, queue, Listen Together, volume, more.

Listen Together state:

- inactive: normal icon;
- connected: accent ring or small presence dot;
- reconnecting: low-key animated indicator;
- error: warning state with tooltip, not a modal interruption.

## Expanded Now Playing

Two modes may be implemented after the base shell:

### Immersive

- larger artwork;
- stronger ambient field;
- fewer competing controls;
- lyrics/queue open as drawer.

### Focus

- artwork + metadata left;
- lyrics or queue right;
- minimal ambient motion.

## Listen Together drawer

```text
┌──────────────────────────────┐
│ Listen Together        ● live│
│                              │
│ Room: Velvet Night           │
│                              │
│ ● Yiğit               Host   │
│ ● Friend                      │
│                              │
│ Now playing                  │
│ [art] Track                  │
│       Artist                 │
│                              │
│ Sync: Excellent              │
│                              │
│ [ Copy invite ] [ QR later ] │
│                              │
│ Leave room                   │
└──────────────────────────────┘
```

Use glass here because it is an elevated contextual surface.

## Theme Studio

Prefer a full options page or large overlay over a tiny popup.

Layout:

```text
┌──────────────────┬────────────────────────────────────┐
│ controls         │ live preview / sample surfaces     │
│                  │                                    │
│ Presets          │ sidebar  card  player  drawer      │
│ Colors           │                                    │
│ Glass            │ updates immediately                │
│ Layout           │                                    │
│ Motion           │                                    │
│ Ambience         │                                    │
└──────────────────┴────────────────────────────────────┘
```

Controls:

- preset gallery
- accent color
- accent behavior: fixed / artwork-aware
- background brightness
- surface brightness
- glass opacity
- blur strength
- edge highlight strength
- radius
- density
- motion: reduced / balanced / expressive
- ambience intensity
- reset
- export/import

## Empty/error states

All Better YTM-specific states should feel intentional:

- no room: concise action and explanation;
- room disconnected: reconnect indicator + retry;
- adapter degraded: settings diagnostic card, never a full-page takeover;
- theme import invalid: explain exact invalid field.

## Accessibility

- minimum WCAG-conscious contrast for readable text;
- keyboard focus rings always visible;
- all icon-only controls have accessible labels;
- no information conveyed by color alone;
- respect reduced motion;
- do not blur text containers excessively;
- room status updates should not spam screen readers.
