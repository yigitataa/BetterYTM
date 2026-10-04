/** Public playback data only. No DOM references or media stream addresses. */
export interface Track {
  readonly id: string;
  readonly videoId?: string;
  readonly title?: string;
  /** Artist/channel label as displayed by the host; never inferred from the title. */
  readonly artist?: string;
  readonly artworkUrl?: string;
  readonly durationMs?: number;
}

export interface TrackMetadata {
  readonly videoId: string | null;
  readonly title: string | null;
  readonly artist: string | null;
  readonly artworkUrl: string | null;
}

export interface PlaybackState {
  readonly playing: boolean;
  readonly positionMs: number;
  readonly durationMs: number | null;
  /** Media volume in [0, 1], independent of the muted flag. */
  readonly volume: number;
  readonly muted: boolean;
  readonly buffering: boolean;
  readonly ended: boolean;
}

export interface PlaybackSnapshot extends PlaybackState {
  readonly track: Track | null;
  /** Client wall-clock milliseconds; not an authoritative room/server time. */
  readonly capturedAt: number;
}
