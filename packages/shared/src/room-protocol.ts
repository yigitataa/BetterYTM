import { z } from 'zod/v3';
import {
  ROOM_PROTOCOL_VERSION,
  roomPlaybackSchema,
  roomSnapshotEventSchema,
  roomSnapshotSchema,
  roomTrackSchema,
} from './room.js';

export const DEFAULT_ROOM_SERVER = 'ws://127.0.0.1:8787/ws';
export const ROOM_PORT_NAME = 'better-ytm/room';
export const roomCodeSchema = z.string().regex(/^[A-Z2-9]{10}$/);
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const time = z.number().int().nonnegative().safe();
const name = z.string().trim().min(1).max(60);
const envelope = {
  protocolVersion: z.literal(ROOM_PROTOCOL_VERSION),
  eventId: id,
  originClientId: id,
  sentAt: time,
};
export const roomActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('playback.set-playing'), playing: z.boolean() }),
  z.strictObject({ type: z.literal('playback.seek'), positionMs: time }),
  z.strictObject({ type: z.literal('playback.set-track'), playback: roomPlaybackSchema }),
  z.strictObject({
    type: z.literal('playback.update'),
    playback: roomPlaybackSchema,
    playbackRevision: time,
    sampledAt: time,
  }),
  z.strictObject({ type: z.literal('queue.add'), track: roomTrackSchema }),
  z.strictObject({ type: z.literal('queue.remove'), entryId: id }),
  z.strictObject({ type: z.literal('queue.move'), entryId: id, direction: z.enum(['up', 'down']) }),
  z.strictObject({ type: z.literal('queue.next'), playbackRevision: time }),
]);
export const roomClientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelope,
    type: z.literal('room.create'),
    displayName: name,
    playback: roomPlaybackSchema,
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('room.join'),
    displayName: name,
    code: roomCodeSchema,
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('room.resume'),
    roomId: id,
    token: z.string().min(32).max(128),
  }),
  z.strictObject({
    ...envelope,
    type: z.literal('room.command'),
    roomId: id,
    baseRevision: time,
    action: roomActionSchema,
  }),
  z.strictObject({ ...envelope, type: z.literal('room.leave'), roomId: id }),
  z.strictObject({ ...envelope, type: z.literal('room.sync'), roomId: id }),
  z.strictObject({ ...envelope, type: z.literal('ping') }),
]);
export const roomErrorCodeSchema = z.enum([
  'invalid-message',
  'not-found',
  'unauthorized',
  'forbidden',
  'conflict',
  'full',
  'rate-limit',
  'room-closed',
  'server-error',
  'protocol-mismatch',
]);
export const roomServerMessageSchema = z.union([
  roomSnapshotEventSchema,
  z.strictObject({
    type: z.literal('room.welcome'),
    clientId: id,
    token: z.string().min(32).max(128),
    snapshot: roomSnapshotSchema,
  }),
  z.strictObject({ type: z.literal('pong'), eventId: id, sentAt: time, serverTimeMs: time }),
  z.strictObject({ type: z.literal('command.ack'), eventId: id, revision: time }),
  z.strictObject({
    type: z.literal('room.error'),
    eventId: id.optional(),
    code: roomErrorCodeSchema,
    message: z.string().max(300),
  }),
]);
export const roomConnectionStateSchema = z.strictObject({
  status: z.enum(['idle', 'connecting', 'connected', 'reconnecting', 'error']),
  clientId: id,
  snapshot: roomSnapshotSchema.nullable(),
  serverUrl: z.string().max(2048),
  displayName: z.string().max(60),
  error: z.string().max(300).nullable(),
  clockOffsetMs: z.number().finite(),
  rttMs: z.number().nonnegative().finite().nullable(),
  panelOpen: z.boolean(),
  lastAck: z.strictObject({ eventId: id, revision: time }).nullable().default(null),
});
export const roomBridgeRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('create'),
    serverUrl: z.string().max(2048),
    displayName: name,
    playback: roomPlaybackSchema,
  }),
  z.strictObject({
    type: z.literal('join'),
    serverUrl: z.string().max(2048),
    displayName: name,
    code: roomCodeSchema,
  }),
  z.strictObject({
    type: z.literal('command'),
    commandId: id.optional(),
    action: roomActionSchema,
  }),
  z.strictObject({ type: z.literal('leave') }),
  z.strictObject({ type: z.literal('retry') }),
  z.strictObject({ type: z.literal('panel'), open: z.boolean() }),
]);
export type RoomAction = z.infer<typeof roomActionSchema>;
export type RoomClientMessage = z.infer<typeof roomClientMessageSchema>;
export type RoomServerMessage = z.infer<typeof roomServerMessageSchema>;
export type RoomConnectionState = z.infer<typeof roomConnectionStateSchema>;
export type RoomBridgeRequest = z.infer<typeof roomBridgeRequestSchema>;

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

/** Plain WS is a local-development option; remote connections require TLS. */
export function normalizeRoomServer(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname === '/') url.pathname = '/ws';
    return url.href;
  } catch {
    return null;
  }
}

export function roomInvite(serverUrl: string, code: string): string {
  const url = new URL('https://music.youtube.com/');
  url.hash = new URLSearchParams({ 'bytm-room': code, 'bytm-server': serverUrl }).toString();
  return url.href;
}

export function parseRoomInvite(value: string): { code: string; serverUrl: string | null } | null {
  const code = normalizeRoomCode(value.trim());
  if (roomCodeSchema.safeParse(code).success) return { code, serverUrl: null };
  try {
    const url = new URL(value);
    if (url.origin !== 'https://music.youtube.com') return null;
    const params = new URLSearchParams(url.hash.slice(1));
    const inviteCode = normalizeRoomCode(params.get('bytm-room') ?? '');
    const serverUrl = normalizeRoomServer(params.get('bytm-server') ?? '');
    return roomCodeSchema.safeParse(inviteCode).success && serverUrl
      ? { code: inviteCode, serverUrl }
      : null;
  } catch {
    return null;
  }
}

export function trackFromRoomInput(value: string): z.infer<typeof roomTrackSchema> | null {
  let videoId = value.trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    try {
      const url = new URL(videoId);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      if (url.hostname === 'youtu.be') videoId = url.pathname.slice(1);
      else if (
        ['music.youtube.com', 'www.youtube.com', 'youtube.com'].includes(url.hostname) &&
        url.pathname === '/watch'
      )
        videoId = url.searchParams.get('v') ?? '';
      else return null;
    } catch {
      return null;
    }
  }
  const parsed = roomTrackSchema.safeParse({ videoId });
  return parsed.success ? parsed.data : null;
}
