import type { PlaybackSnapshot, TrackMetadata } from '@better-ytm/shared';
import type { PlaybackEventType } from './types.js';

export function changedPlaybackEvents(
  previous: PlaybackSnapshot | null,
  current: PlaybackSnapshot | null,
  seeked = false,
  previousMetadata?: TrackMetadata,
  currentMetadata?: TrackMetadata,
): PlaybackEventType[] {
  const events: PlaybackEventType[] = [];
  const before = previousMetadata ?? previous?.track;
  const after = currentMetadata ?? current?.track;
  const previousId = previousMetadata ? previousMetadata.videoId : (previous?.track?.id ?? null);
  const currentId = currentMetadata ? currentMetadata.videoId : (current?.track?.id ?? null);
  if (previousId !== currentId) events.push('trackchange');
  if (
    (before?.title ?? null) !== (after?.title ?? null) ||
    (before?.artist ?? null) !== (after?.artist ?? null) ||
    (before?.artworkUrl ?? null) !== (after?.artworkUrl ?? null)
  )
    events.push('metadatachange');
  if (previous && current) {
    if (previous.playing !== current.playing) events.push(current.playing ? 'play' : 'pause');
    if (previous.positionMs !== current.positionMs) events.push('positionchange');
    if (previous.volume !== current.volume || previous.muted !== current.muted)
      events.push('volumechange');
    if (previous.buffering !== current.buffering || previous.ended !== current.ended)
      events.push('bufferingchange');
  }
  if ((previous?.durationMs ?? null) !== (current?.durationMs ?? null))
    events.push('durationchange');
  if (seeked && current) events.push('seek');
  if (events.length || !!previous !== !!current) events.push('snapshot');
  return events;
}
