import type { PlaybackState } from '@better-ytm/shared';
import type { AdapterErrorCode, AdapterResult } from './types.js';
import { isUsableControl } from './selectors.js';

export const failure = (code: AdapterErrorCode, message: string): AdapterResult => ({
  ok: false,
  error: { code, message },
});
const success: AdapterResult = Object.freeze({ ok: true });

export function finiteMilliseconds(seconds: number): number | null {
  const milliseconds = Math.round(seconds * 1000);
  return Number.isSafeInteger(milliseconds) && seconds >= 0 ? milliseconds : null;
}

export function readPlayback(media: HTMLMediaElement | null): PlaybackState | null {
  if (!media?.isConnected || media.readyState < 1 || media.error) return null;
  const positionMs = finiteMilliseconds(media.currentTime);
  if (positionMs === null || !Number.isFinite(media.volume) || media.volume < 0 || media.volume > 1)
    return null;
  return Object.freeze({
    playing: !media.paused && !media.ended,
    positionMs,
    durationMs: media.duration > 0 ? finiteMilliseconds(media.duration) : null,
    volume: media.volume,
    muted: media.muted,
    buffering: !media.paused && media.readyState < 3,
    ended: media.ended,
  });
}

export async function setPlaying(
  media: HTMLMediaElement | null,
  playing: boolean,
): Promise<AdapterResult> {
  if (!media?.isConnected || media.readyState < 1 || media.error)
    return failure('unavailable', 'The mapped host media element is unavailable or not ready.');
  try {
    if (playing) {
      if (media.paused || media.ended) await media.play();
    } else if (!media.paused) media.pause();
    return success;
  } catch (error) {
    // Do not forward native exception messages that could contain resource URLs.
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError')
      return failure(
        'autoplay-blocked',
        'Start playback using YouTube Music; the browser blocked this play request.',
      );
    if (name === 'AbortError')
      return failure('interrupted', 'YouTube Music interrupted the playback request.');
    return failure('host-error', 'The host media element rejected the playback request.');
  }
}

export function seekablePosition(
  seconds: number,
  duration: number,
  ranges: readonly { start: number; end: number }[],
): boolean {
  return (
    Number.isFinite(seconds) &&
    seconds >= 0 &&
    Number.isFinite(duration) &&
    seconds <= duration &&
    ranges.some(({ start, end }) => seconds >= start && seconds <= end)
  );
}

export function canSeek(media: HTMLMediaElement | null, control: Element | null): boolean {
  return (
    !!media?.isConnected &&
    !media.error &&
    media.readyState >= 1 &&
    Number.isFinite(media.duration) &&
    media.duration > 0 &&
    media.seekable.length > 0 &&
    isUsableControl(control)
  );
}

export function seekMedia(
  media: HTMLMediaElement | null,
  control: Element | null,
  seconds: number,
): AdapterResult {
  if (!Number.isFinite(seconds) || seconds < 0)
    return failure(
      'invalid-argument',
      'Seek position must be a finite non-negative number of seconds.',
    );
  if (!control)
    return failure('unsupported', 'Seeking needs a verified host seek-control mapping.');
  if (!isUsableControl(control))
    return failure('control-disabled', 'YouTube Music currently disables or hides seeking.');
  if (!canSeek(media, control) || !media)
    return failure('unavailable', 'The host media is not currently seekable.');
  try {
    const ranges = Array.from({ length: media.seekable.length }, (_, i) => ({
      start: media.seekable.start(i),
      end: media.seekable.end(i),
    }));
    if (!seekablePosition(seconds, media.duration, ranges))
      return failure(
        'invalid-argument',
        'The requested position is outside the host seekable range.',
      );
    media.currentTime = seconds;
    return success;
  } catch {
    return failure('host-error', 'The host rejected the seek operation.');
  }
}

export function clickControl(control: Element | null): AdapterResult {
  if (!control)
    return failure('unsupported', 'This host control has not been mapped or is unavailable.');
  if (!isUsableControl(control))
    return failure('control-disabled', 'YouTube Music currently disables or hides this control.');
  try {
    control.click();
    // Successful dispatch; the following host events report the actual transition.
    return success;
  } catch {
    return failure('host-error', 'The host control rejected the operation.');
  }
}
