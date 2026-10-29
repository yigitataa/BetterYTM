import type { PlaybackSnapshot, TrackMetadata } from '@better-ytm/shared';
import { createLayoutCapture } from './layout.js';
import { bindVisualGlass } from './visual-glass.js';
import { bindCompactNavigation } from './navigation.js';
import { compileVisualSkin } from './visual-styles.js';
import type { VisualRule } from '@better-ytm/shared';
import { createDiagnosticReporter, emptyCapabilities, healthSignature } from './diagnostics.js';
import { changedPlaybackEvents } from './events.js';
import {
  readMetadata,
  trackFromMetadata,
  videoIdFromWatchLink,
  watchUrlForVideoId,
} from './metadata.js';
import { observePlayer } from './observer.js';
import { canSeek, clickControl, failure, readPlayback, seekMedia, setPlaying } from './player.js';
import { isUsableControl, profileIsMapped, resolveElement, SELECTOR_PROFILE } from './selectors.js';
import type {
  AdapterDiagnostic,
  AdapterHealth,
  AdapterResult,
  CompactNavigationOptions,
  YTMAdapter,
  YTMEvent,
} from './types.js';

type Observation = ReturnType<typeof observePlayer>;
const owners = new WeakMap<Document, YTMAdapter>();
const emptyMetadata = (): TrackMetadata =>
  Object.freeze({ videoId: null, title: null, artist: null, artworkUrl: null });

interface Probe {
  media: HTMLMediaElement | null;
  seekControl: Element | null;
  next: Element | null;
  previous: Element | null;
  metadata: TrackMetadata;
  snapshot: PlaybackSnapshot | null;
  health: AdapterHealth;
}

class DOMYTMAdapter implements YTMAdapter {
  #document: Document;
  #initialized = false;
  #observation: Observation | undefined;
  #listeners = new Set<{ listener: (event: YTMEvent) => void }>();
  #epoch = 0;
  #glass: ReturnType<typeof bindVisualGlass> | undefined;
  #navigation: ReturnType<typeof bindCompactNavigation> | undefined;
  #captureLayout: ReturnType<typeof createLayoutCapture>;
  #reporter = createDiagnosticReporter();
  #previous: PlaybackSnapshot | null = null;
  #previousMetadata: TrackMetadata = emptyMetadata();
  #healthSignature = '';
  #probeFailed = false;

  constructor(document: Document) {
    this.#document = document;
    this.#captureLayout = createLayoutCapture(document);
  }

  initialize() {
    if (this.#initialized) return;
    const owner = owners.get(this.#document);
    if (owner && owner !== this) owner.destroy();
    owners.set(this.#document, this);
    this.#initialized = true;
    this.#epoch++;
    this.#probeFailed = false;
    try {
      if (profileIsMapped())
        this.#observation = observePlayer(this.#document, (causes) => this.#refresh(causes));
      this.#refresh(new Set());
    } catch {
      this.#observation?.stop();
      this.#observation = undefined;
      this.#probeFailed = true;
      this.#publishHealth(this.#emptyProbe().health);
    }
  }

  destroy() {
    this.#initialized = false;
    this.disableVisualGlass();
    this.disableCompactNavigation();
    this.#epoch++;
    this.#observation?.stop();
    this.#observation = undefined;
    this.#previous = null;
    this.#previousMetadata = emptyMetadata();
    this.#healthSignature = '';
    this.#probeFailed = false;
    this.#listeners.clear();
    this.#reporter.reset();
    if (owners.get(this.#document) === this) owners.delete(this.#document);
  }

  #emptyProbe(): Probe {
    return {
      media: null,
      seekControl: null,
      next: null,
      previous: null,
      metadata: emptyMetadata(),
      snapshot: null,
      health: Object.freeze({
        status: !this.#initialized ? 'inactive' : this.#probeFailed ? 'degraded' : 'unmapped',
        profileId: SELECTOR_PROFILE.id,
        capabilities: emptyCapabilities(),
        diagnostics: Object.freeze(
          !this.#initialized
            ? []
            : [
                Object.freeze({
                  code: this.#probeFailed ? 'probe-failed' : 'profile-unmapped',
                  message: this.#probeFailed
                    ? 'Host DOM probing failed. No playback operation is enabled.'
                    : 'Verified player mappings are required; no selectors were guessed.',
                }),
              ],
        ),
      }),
    };
  }

  #probe(): Probe {
    if (!this.#initialized || !profileIsMapped() || this.#probeFailed) return this.#emptyProbe();
    const diagnostics: AdapterDiagnostic[] = [];
    const mediaRoot = resolveElement(this.#document, 'mediaRoot');
    const playerRoot = resolveElement(this.#document, 'playerRoot');
    const mediaNode = resolveElement(mediaRoot.element, 'media');
    const view = this.#document.defaultView;
    const media =
      view && mediaNode.element instanceof view.HTMLMediaElement ? mediaNode.element : null;
    const title = resolveElement(mediaRoot.element, 'title');
    const artist = resolveElement(playerRoot.element, 'artist');
    const artwork = resolveElement(playerRoot.element, 'artwork');
    const trackLink = resolveElement(mediaRoot.element, 'trackLink');
    const seekControl = resolveElement(playerRoot.element, 'seekControl');
    const next = resolveElement(playerRoot.element, 'next');
    const previous = resolveElement(playerRoot.element, 'previous');
    for (const [role, resolution] of Object.entries({
      mediaRoot,
      playerRoot,
      media: mediaNode,
      title,
      artist,
      artwork,
      trackLink,
      seekControl,
      next,
      previous,
    })) {
      if (resolution.problem)
        diagnostics.push({
          code: `${role}-${resolution.problem}`,
          message: `${role}: ${resolution.problem}. Only dependent capabilities are disabled.`,
        });
    }
    if (mediaNode.element && !media)
      diagnostics.push({
        code: 'media-type-invalid',
        message: 'The mapped node is not an HTML media element.',
      });

    this.#observation?.bind(mediaRoot.element, playerRoot.element, media);
    const metadata = readMetadata(
      {
        title: title.element,
        artist: artist.element,
        artwork: artwork.element,
        trackLink: trackLink.element,
      },
      this.#document.baseURI,
    );
    const playback = readPlayback(media);
    for (const [role, element, value] of [
      ['title', title.element, metadata.title],
      ['artist', artist.element, metadata.artist],
      ['artwork', artwork.element, metadata.artworkUrl],
    ] as const) {
      if (element && !value)
        diagnostics.push({
          code: `${role}-unavailable`,
          message: `${role}: the mapped node has no readable public value.`,
        });
    }
    if (media && !playback)
      diagnostics.push({
        code: media.error ? 'host-media-error' : 'media-not-ready',
        message: media.error
          ? 'YouTube Music reports a media error; playback commands are unavailable.'
          : 'The host has not provided readable playback state yet.',
      });
    if (trackLink.element && !metadata.videoId)
      diagnostics.push({
        code: 'track-identity-unavailable',
        message: 'The mapped player link does not provide a valid public watch identifier.',
      });
    const snapshot: PlaybackSnapshot | null = playback
      ? Object.freeze({
          ...playback,
          track: trackFromMetadata(metadata, playback.durationMs),
          capturedAt: Date.now(),
        })
      : null;
    const capabilities = Object.freeze({
      playback: !!playback,
      metadata: !!metadata.title && !!metadata.artist,
      trackIdentity: !!metadata.videoId,
      artwork: !!metadata.artworkUrl,
      position: !!playback,
      duration: playback?.durationMs !== null && playback?.durationMs !== undefined,
      volume: !!playback,
      playPause: !!playback,
      seeking: canSeek(media, seekControl.element),
      next: isUsableControl(next.element),
      previous: isUsableControl(previous.element),
      openTrack: this.#document.location?.origin === 'https://music.youtube.com',
    });
    const health: AdapterHealth = Object.freeze({
      status: !playback ? 'waiting' : diagnostics.length ? 'degraded' : 'healthy',
      profileId: SELECTOR_PROFILE.id,
      capabilities,
      diagnostics: Object.freeze(diagnostics.map((diagnostic) => Object.freeze(diagnostic))),
    });
    return {
      media,
      seekControl: seekControl.element,
      next: next.element,
      previous: previous.element,
      metadata,
      snapshot,
      health,
    };
  }

  #read(): Probe {
    try {
      return this.#probe();
    } catch {
      this.#probeFailed = true;
      this.#observation?.stop();
      this.#observation = undefined;
      const failed = this.#emptyProbe();
      this.#publishHealth(failed.health);
      return failed;
    }
  }

  #emit(event: YTMEvent) {
    for (const subscription of [...this.#listeners]) {
      if (!this.#listeners.has(subscription)) continue;
      try {
        subscription.listener(Object.freeze(event));
      } catch {
        this.#listeners.delete(subscription);
        console.error(
          '[Better YTM] Adapter subscriber failed and was removed; other subscriptions remain active.',
        );
      }
    }
  }

  #publishHealth(health: AdapterHealth) {
    const signature = healthSignature(health);
    if (signature === this.#healthSignature) return;
    this.#healthSignature = signature;
    this.#reporter.report(health);
    this.#emit({ type: 'healthchange', health });
  }

  #refresh(causes: ReadonlySet<string>) {
    if (!this.#initialized) return;
    const epoch = this.#epoch;
    const probe = this.#read();
    this.#publishHealth(probe.health);
    if (!this.#initialized || this.#epoch !== epoch) return;
    const previous = this.#previous;
    const previousMetadata = this.#previousMetadata;
    this.#previous = probe.snapshot;
    this.#previousMetadata = probe.metadata;
    for (const type of changedPlaybackEvents(
      previous,
      probe.snapshot,
      causes.has('seeked'),
      previousMetadata,
      probe.metadata,
    )) {
      if (!this.#initialized || this.#epoch !== epoch) return;
      this.#emit({ type, snapshot: probe.snapshot, metadata: probe.metadata });
    }
  }

  getHealth() {
    return this.#read().health;
  }
  getCurrentTrack() {
    const probe = this.#read();
    return trackFromMetadata(probe.metadata, probe.snapshot?.durationMs ?? null);
  }
  getTrackMetadata() {
    return this.#read().metadata;
  }
  getPlaybackSnapshot() {
    return this.#read().snapshot;
  }
  getPlaybackState() {
    const snapshot = this.getPlaybackSnapshot();
    if (!snapshot) return null;
    const { playing, positionMs, durationMs, volume, muted, buffering, ended } = snapshot;
    return Object.freeze({ playing, positionMs, durationMs, volume, muted, buffering, ended });
  }

  #inactive(): AdapterResult {
    return failure('inactive', 'Initialize the adapter before requesting playback operations.');
  }
  async #setPlaying(playing: boolean): Promise<AdapterResult> {
    if (!this.#initialized) return this.#inactive();
    const epoch = this.#epoch;
    const probe = this.#read();
    const result = await setPlaying(probe.media, playing);
    if (!this.#initialized || this.#epoch !== epoch || this.#read().media !== probe.media)
      return failure('interrupted', 'Adapter lifecycle or host media changed during the request.');
    return result;
  }
  play() {
    return this.#setPlaying(true);
  }
  pause() {
    return this.#setPlaying(false);
  }
  togglePlayback() {
    if (!this.#initialized) return Promise.resolve(this.#inactive());
    const probe = this.#read();
    return this.#setPlaying(!(probe.snapshot?.playing ?? false));
  }
  seek(seconds: number) {
    if (!this.#initialized) return Promise.resolve(this.#inactive());
    const probe = this.#read();
    return Promise.resolve(seekMedia(probe.media, probe.seekControl, seconds));
  }
  next() {
    return Promise.resolve(this.#initialized ? clickControl(this.#read().next) : this.#inactive());
  }
  previous() {
    return Promise.resolve(
      this.#initialized ? clickControl(this.#read().previous) : this.#inactive(),
    );
  }
  async openTrack(videoId: string): Promise<AdapterResult> {
    if (!this.#initialized) return this.#inactive();
    const url = watchUrlForVideoId(videoId);
    if (!url)
      return failure('invalid-argument', 'A valid public YouTube video identifier is required.');
    if (!this.#read().health.capabilities.openTrack)
      return failure('unavailable', 'Public watch navigation is unavailable in this document.');
    // A restored room can arrive before player metadata on the new watch page.
    // Let that page finish loading instead of navigating to itself indefinitely.
    if (videoIdFromWatchLink(this.#document.location.href, this.#document.baseURI) === videoId)
      return { ok: true };
    try {
      this.#document.location.assign(url);
      return { ok: true };
    } catch {
      return failure('host-error', 'The browser rejected public watch-page navigation.');
    }
  }
  subscribe(listener: (event: YTMEvent) => void) {
    const subscription = { listener };
    this.#listeners.add(subscription);
    return () => {
      this.#listeners.delete(subscription);
    };
  }
  getVisualSkinStyleSheet(rules: readonly VisualRule[]) {
    return compileVisualSkin(rules);
  }
  enableVisualGlass(): AdapterResult {
    if (!this.#initialized) return this.#inactive();
    if (this.#glass)
      return this.#glass.getHealth().enabled
        ? { ok: true }
        : failure('unavailable', 'Decorative blur probing stopped; inspect glass health.');
    try {
      this.#glass = bindVisualGlass(this.#document);
      return { ok: true };
    } catch {
      return failure(
        'host-error',
        'Decorative blur unavailable; paint-only surfaces remain usable.',
      );
    }
  }
  enableCompactNavigation(options: CompactNavigationOptions = {}): AdapterResult {
    if (!this.#initialized) return this.#inactive();
    if (this.#navigation) {
      this.#navigation.updateOptions(options);
      return { ok: true };
    }
    try {
      this.#navigation = bindCompactNavigation(this.#document, options);
      return { ok: true };
    } catch {
      return failure(
        'host-error',
        'Compact navigation unavailable; native navigation remains available.',
      );
    }
  }
  disableCompactNavigation() {
    this.#navigation?.dispose();
    this.#navigation = undefined;
  }
  getVisualGlassHealth() {
    return this.#glass?.getHealth() ?? { enabled: false, eligible: [], skipped: {} };
  }
  disableVisualGlass() {
    this.#glass?.dispose();
    this.#glass = undefined;
  }
  captureLayout() {
    return this.#captureLayout();
  }
}

/** Construct in the content composition root; features receive only YTMAdapter. */
export function createYTMAdapter(document: Document): YTMAdapter {
  return new DOMYTMAdapter(document);
}
