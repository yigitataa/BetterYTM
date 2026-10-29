import {
  parseRoomInvite,
  roomPlaybackFromSnapshot,
  roomPosition,
  roomTrackSchema,
  type RoomTrack,
  type RoomAction,
  type RoomPlayback,
} from '@better-ytm/shared';
import type { AdapterResult, YTMAdapter, YTMEvent } from '@better-ytm/ytm-adapter';
import { createChromeRoomBridge, type RoomBridge } from './bridge.js';

export function createRoomController(
  adapter: YTMAdapter,
  bridge: RoomBridge = createChromeRoomBridge(),
) {
  let active = false;
  let unsubscribeAdapter: (() => void) | undefined;
  let unsubscribeBridge: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let connection = bridge.getState();
  let issue: string | null = null;
  let driftMs: number | null = null;
  let applying = false;
  let hostApply = false;
  let roomId: string | null = null;
  let epoch = -1;
  let opening: { videoId: string; at: number } | null = null;
  let suppressUntil = 0;
  let nextRequestedAt = 0;
  let lastPublishedAt = 0;
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const isHost = () =>
    !!connection.snapshot && connection.snapshot.hostClientId === connection.clientId;
  function report(result: AdapterResult) {
    if (!result.ok)
      issue =
        result.error.code === 'autoplay-blocked'
          ? 'Tarayıcı sesi başlatmayı engelledi. “Senkronu başlat”a bas veya YouTube Music’ten oynat.'
          : `Oynatıcı hazır değil (${result.error.code}). YouTube Music’te parçanın açılmasını bekle ve tekrar dene.`;
    return result.ok;
  }
  function publish() {
    if (
      !active ||
      !isHost() ||
      connection.status !== 'connected' ||
      hostApply ||
      applying ||
      opening ||
      nextRequestedAt ||
      Date.now() < suppressUntil
    )
      return;
    const local = adapter.getPlaybackSnapshot();
    if (!local || local.buffering || local.ended) return;
    const playback = roomPlaybackFromSnapshot(local);
    if (!playback) return;
    lastPublishedAt = Date.now();
    bridge.send({ type: 'command', action: { type: 'playback.update', playback } });
  }
  function next() {
    if (!isHost() || connection.status !== 'connected' || nextRequestedAt) return;
    nextRequestedAt = Date.now();
    bridge.send({ type: 'command', action: { type: 'queue.next' } });
    notify();
  }
  async function reconcile() {
    const room = connection.snapshot;
    if (!active || !room || connection.status !== 'connected' || applying) return;
    if (nextRequestedAt) {
      if (Date.now() - nextRequestedAt > 8000) {
        nextRequestedAt = 0;
        issue = 'Sonraki parçaya geçilemedi. Sırayı kontrol edip tekrar dene.';
        notify();
      }
      return;
    }
    if (isHost() && !hostApply) return;
    const target = room.playback;
    if (!target.track) {
      driftMs = null;
      hostApply = false;
      issue = null;
      if (!isHost() && adapter.getPlaybackSnapshot()?.playing) report(await adapter.pause());
      notify();
      return;
    }
    const local = adapter.getPlaybackSnapshot();
    const metadata = adapter.getTrackMetadata();
    const videoId = target.track.videoId;
    const version = generation;
    applying = true;
    try {
      if (metadata.videoId !== videoId) {
        if (opening?.videoId === videoId) {
          if (Date.now() - opening.at > 20000)
            issue =
              'Parça yüklenemedi. YouTube Music’te bu parçaya erişebildiğini kontrol edip senkronu tekrar başlat.';
          return;
        }
        opening = { videoId, at: Date.now() };
        issue = 'Odadaki parça YouTube Music’te açılıyor…';
        report(await adapter.openTrack(videoId));
        return;
      }
      if (!local || local.buffering || !adapter.getHealth().capabilities.playPause) {
        issue = 'Parçanın yüklenmesi bekleniyor…';
        return;
      }
      opening = null;
      const position = roomPosition(room, Date.now() + connection.clockOffsetMs);
      if (
        target.playing &&
        local.ended &&
        local.durationMs !== null &&
        position >= local.durationMs - 500
      ) {
        issue = 'Sonraki parça bekleniyor…';
        return;
      }
      driftMs = position - local.positionMs;
      if (Math.abs(driftMs) > 750 || (local.ended && position < (local.durationMs ?? 0) - 1000)) {
        if (!report(await adapter.seek(position / 1000))) return;
      }
      if (!active || version !== generation) return;
      if (
        target.playing !== local.playing &&
        !report(await (target.playing ? adapter.play() : adapter.pause()))
      )
        return;
      if (!active || version !== generation) return;
      issue = null;
      hostApply = false;
      suppressUntil = Date.now() + 600;
    } finally {
      applying = false;
      if (active) notify();
    }
  }
  function adapterEvent(event: YTMEvent) {
    if (
      event.type === 'trackchange' ||
      event.type === 'metadatachange' ||
      event.type === 'healthchange'
    )
      notify();
    if (!connection.snapshot || connection.status !== 'connected') return;
    if (isHost() && event.type === 'ended' && !hostApply && !applying && !nextRequestedAt) {
      next();
      return;
    }
    if (isHost() && ['play', 'pause', 'seek', 'trackchange', 'metadatachange'].includes(event.type))
      publish();
  }
  function refreshConnection() {
    const previous = connection;
    connection = bridge.getState();
    const room = connection.snapshot;
    if (
      room &&
      (room.roomId !== roomId ||
        room.playbackEpoch !== epoch ||
        (previous.status !== 'connected' && connection.status === 'connected'))
    ) {
      roomId = room.roomId;
      epoch = room.playbackEpoch;
      hostApply = isHost();
      opening = null;
      nextRequestedAt = 0;
      generation++;
    }
    if (!room) {
      roomId = null;
      epoch = -1;
      hostApply = false;
      opening = null;
      nextRequestedAt = 0;
      issue = null;
      driftMs = null;
      generation++;
    }
    if (connection.error && nextRequestedAt) nextRequestedAt = 0;
    notify();
    void reconcile();
  }
  return {
    getState() {
      return {
        connection,
        issue,
        driftMs,
        host: isHost(),
        changingTrack: !!nextRequestedAt || !!opening,
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (active) return;
      active = true;
      roomId = null;
      epoch = -1;
      opening = null;
      nextRequestedAt = 0;
      suppressUntil = 0;
      lastPublishedAt = Date.now();
      generation++;
      unsubscribeAdapter = adapter.subscribe(adapterEvent);
      unsubscribeBridge = bridge.subscribe(refreshConnection);
      bridge.start();
      refreshConnection();
      timer = setInterval(() => {
        if (
          isHost() &&
          adapter.getPlaybackSnapshot()?.ended &&
          !hostApply &&
          !nextRequestedAt &&
          connection.snapshot?.playback.playing
        )
          next();
        if (Date.now() - lastPublishedAt >= 3000) publish();
        void reconcile();
      }, 1000);
    },
    stop(leave = false) {
      if (leave) bridge.send({ type: 'leave' });
      active = false;
      generation++;
      unsubscribeAdapter?.();
      unsubscribeBridge?.();
      unsubscribeAdapter = unsubscribeBridge = undefined;
      if (timer) clearInterval(timer);
      timer = undefined;
      bridge.stop();
    },
    create(serverUrl: string, displayName: string) {
      const local = adapter.getPlaybackSnapshot();
      const empty: RoomPlayback = { track: null, playing: false, positionMs: 0, durationMs: null };
      bridge.send({
        type: 'create',
        serverUrl,
        displayName,
        playback: local ? (roomPlaybackFromSnapshot(local) ?? empty) : empty,
      });
    },
    join(serverUrl: string, displayName: string, invite: string) {
      const parsed = parseRoomInvite(invite);
      if (!parsed) {
        issue = 'Geçerli bir oda kodu veya davet bağlantısı gir.';
        notify();
        return;
      }
      bridge.send({
        type: 'join',
        serverUrl: parsed.serverUrl ?? serverUrl,
        displayName,
        code: parsed.code,
      });
    },
    leave() {
      bridge.send({ type: 'leave' });
    },
    retry() {
      bridge.send({ type: 'retry' });
    },
    setPanelOpen(open: boolean) {
      bridge.send({ type: 'panel', open });
    },
    command(action: RoomAction) {
      bridge.send({ type: 'command', action });
    },
    addCurrent() {
      const metadata = adapter.getTrackMetadata();
      const track = roomTrackSchema.safeParse({
        videoId: metadata.videoId,
        ...(metadata.title ? { title: metadata.title } : {}),
        ...(metadata.artist ? { artist: metadata.artist } : {}),
      });
      if (!track.success) {
        issue = 'Önce YouTube Music’te bir şarkı seç.';
        notify();
        return;
      }
      bridge.send({ type: 'command', action: { type: 'queue.add', track: track.data } });
    },
    addTrack(track: RoomTrack) {
      bridge.send({ type: 'command', action: { type: 'queue.add', track } });
    },
    next,
    async togglePlayback() {
      if (!isHost() || connection.status !== 'connected' || hostApply || nextRequestedAt) return;
      if (report(await adapter.togglePlayback())) {
        suppressUntil = 0;
        publish();
      }
      notify();
    },
    async resync() {
      issue = null;
      opening = null;
      hostApply = isHost();
      // Direct gesture allows the browser to unlock media playback before async correction.
      if (connection.snapshot?.playback.playing) report(await adapter.play());
      await reconcile();
      notify();
    },
  };
}
export type RoomController = ReturnType<typeof createRoomController>;
