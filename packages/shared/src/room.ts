import { z } from 'zod/v3';
import type { PlaybackSnapshot } from './playback.js';

/** Versioned wire contract. Runtime validation is shared by client and server. */
export const ROOM_PROTOCOL_VERSION = 2;
const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const milliseconds = z.number().int().nonnegative().safe();

export const roomTrackSchema = z.strictObject({
  videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().max(500).optional(),
  artist: z.string().max(500).optional(),
});

/** Volume, artwork URLs, media URLs and local capturedAt never enter room state. */
export const roomPlaybackSchema = z
  .strictObject({
    track: roomTrackSchema.nullable(),
    playing: z.boolean(),
    positionMs: milliseconds,
    durationMs: milliseconds.nullable(),
  })
  .superRefine((playback, context) => {
    if (
      !playback.track &&
      (playback.playing || playback.positionMs !== 0 || playback.durationMs !== null)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Empty playback must be stopped at zero without a duration.',
      });
    if (playback.durationMs !== null && playback.positionMs > playback.durationMs)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Position exceeds duration.' });
  });

export const roomMemberSchema = z.strictObject({
  clientId: identifier,
  displayName: z.string().trim().min(1).max(60),
  connected: z.boolean().default(true),
});

/** Upcoming tracks only. Repeated videoIds are allowed; entry IDs are unique. */
export const roomQueueItemSchema = z.strictObject({
  id: identifier,
  track: roomTrackSchema,
  addedByClientId: identifier,
});

/** Server owns membership, host assignment, time and revision. */
export const roomSnapshotSchema = z
  .strictObject({
    roomId: identifier,
    code: z.string().regex(/^[A-Z2-9]{10}$/),
    playbackEpoch: milliseconds,
    playbackRevision: milliseconds,
    controllerClientId: identifier,
    revision: milliseconds,
    serverTimeMs: milliseconds,
    hostClientId: identifier,
    members: z.array(roomMemberSchema).min(1).max(50),
    playback: roomPlaybackSchema,
    queue: z.array(roomQueueItemSchema).max(200),
  })
  .superRefine((room, context) => {
    const members = new Set(room.members.map(({ clientId }) => clientId));
    if (members.size !== room.members.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate room member.' });
    if (!members.has(room.controllerClientId))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Playback controller must be a room member.',
      });
    if (!members.has(room.hostClientId))
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Host must be a room member.' });
    if (new Set(room.queue.map(({ id }) => id)).size !== room.queue.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Duplicate queue entry.' });
  });

export const roomSnapshotEventSchema = z
  .strictObject({
    protocolVersion: z.literal(ROOM_PROTOCOL_VERSION),
    type: z.literal('room.snapshot'),
    eventId: identifier,
    roomId: identifier,
    originClientId: identifier,
    sentAt: milliseconds,
    revision: milliseconds,
    snapshot: roomSnapshotSchema,
  })
  .superRefine((event, context) => {
    if (event.roomId !== event.snapshot.roomId || event.revision !== event.snapshot.revision)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Envelope and snapshot must identify the same room revision.',
      });
  });

export type RoomTrack = z.infer<typeof roomTrackSchema>;
export type RoomPlayback = z.infer<typeof roomPlaybackSchema>;
export type RoomMember = z.infer<typeof roomMemberSchema>;
export type RoomQueueItem = z.infer<typeof roomQueueItemSchema>;
export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomSnapshotEvent = z.infer<typeof roomSnapshotEventSchema>;

/** Explicit projection prevents leaking local-only state into future transport messages. */
export function roomPlaybackFromSnapshot(snapshot: PlaybackSnapshot): RoomPlayback | null {
  const videoId = snapshot.track?.videoId;
  if (!videoId) return null;
  const parsed = roomPlaybackSchema.safeParse({
    track: {
      videoId,
      ...(snapshot.track?.title !== undefined ? { title: snapshot.track.title } : {}),
      ...(snapshot.track?.artist !== undefined ? { artist: snapshot.track.artist } : {}),
    },
    playing: snapshot.playing,
    positionMs: snapshot.positionMs,
    durationMs: snapshot.durationMs,
  });
  return parsed.success ? parsed.data : null;
}
