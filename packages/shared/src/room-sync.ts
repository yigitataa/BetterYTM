import type { RoomSnapshot } from './room.js';

export function roomPosition(room: RoomSnapshot, serverNow: number): number {
  const elapsed = room.playback.playing ? Math.max(0, serverNow - room.serverTimeMs) : 0;
  const position = room.playback.positionMs + elapsed;
  return Math.round(Math.min(position, room.playback.durationMs ?? Number.MAX_SAFE_INTEGER));
}

export interface ClockSample {
  offset: number;
  rtt: number;
}
export function clockSample(
  sentAt: number,
  receivedAt: number,
  serverTime: number,
): ClockSample | null {
  const rtt = receivedAt - sentAt;
  if (![sentAt, receivedAt, serverTime].every(Number.isFinite) || rtt < 0 || rtt > 10000)
    return null;
  return { offset: serverTime - (sentAt + receivedAt) / 2, rtt };
}
export function estimateClock(samples: readonly ClockSample[]): ClockSample {
  if (!samples.length) return { offset: 0, rtt: 0 };
  // Reject the slower half before taking a median to reduce asymmetric-delay noise.
  const best = [...samples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.ceil(samples.length / 2));
  const offsets = best.map(({ offset }) => offset).sort((a, b) => a - b);
  return { offset: offsets[Math.floor(offsets.length / 2)]!, rtt: best[0]!.rtt };
}
