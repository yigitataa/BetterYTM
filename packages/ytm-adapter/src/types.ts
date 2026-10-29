import type { PlaybackSnapshot, PlaybackState, Track, TrackMetadata } from '@better-ytm/shared';
import type { GlassBindingHealth, LayoutSnapshot, VisualRule } from '@better-ytm/shared';

export interface AdapterCapabilities {
  readonly playback: boolean;
  readonly metadata: boolean;
  readonly trackIdentity: boolean;
  readonly artwork: boolean;
  readonly position: boolean;
  readonly duration: boolean;
  readonly volume: boolean;
  readonly playPause: boolean;
  readonly seeking: boolean;
  readonly next: boolean;
  readonly previous: boolean;
  readonly openTrack: boolean;
}

export interface AdapterDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface AdapterHealth {
  readonly status: 'inactive' | 'unmapped' | 'waiting' | 'healthy' | 'degraded';
  readonly profileId: string;
  readonly capabilities: AdapterCapabilities;
  readonly diagnostics: readonly AdapterDiagnostic[];
}

export type AdapterErrorCode =
  | 'inactive'
  | 'unavailable'
  | 'unsupported'
  | 'invalid-argument'
  | 'control-disabled'
  | 'autoplay-blocked'
  | 'interrupted'
  | 'host-error';

export type AdapterResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: { readonly code: AdapterErrorCode; readonly message: string };
    };

export type PlaybackEventType =
  | 'snapshot'
  | 'play'
  | 'pause'
  | 'trackchange'
  | 'metadatachange'
  | 'positionchange'
  | 'seek'
  | 'durationchange'
  | 'volumechange'
  | 'bufferingchange';

export type YTMEvent =
  | {
      readonly type: PlaybackEventType;
      readonly snapshot: PlaybackSnapshot | null;
      readonly metadata: TrackMetadata;
    }
  | { readonly type: 'healthchange'; readonly health: AdapterHealth };

export interface YTMAdapter {
  initialize(): void;
  destroy(): void;
  getHealth(): AdapterHealth;
  getCurrentTrack(): Track | null;
  getTrackMetadata(): TrackMetadata;
  getPlaybackState(): PlaybackState | null;
  getPlaybackSnapshot(): PlaybackSnapshot | null;
  play(): Promise<AdapterResult>;
  pause(): Promise<AdapterResult>;
  togglePlayback(): Promise<AdapterResult>;
  /** Seconds, matching the master blueprint and native media API. Snapshots use ms. */
  seek(seconds: number): Promise<AdapterResult>;
  next(): Promise<AdapterResult>;
  previous(): Promise<AdapterResult>;
  /** Public watch-page navigation; no private player API or network interception. */
  openTrack(videoId: string): Promise<AdapterResult>;
  subscribe(listener: (event: YTMEvent) => void): () => void;
  /** Compile semantic paint rules without exposing host selectors. */
  getVisualSkinStyleSheet(rules: readonly VisualRule[]): string;
  enableVisualGlass(): AdapterResult;
  disableVisualGlass(): void;
  getVisualGlassHealth(): GlassBindingHealth;
  /** User-requested header shortcuts and playlist-only native guide. */
  enableCompactNavigation(): AdapterResult;
  disableCompactNavigation(): void;
  /** Manual diagnostics only; no automatic layout probing. */
  captureLayout(): LayoutSnapshot;
}
