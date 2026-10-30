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

type Echo = {
  type: 'play' | 'pause' | 'seek';
  videoId: string;
  position: number;
  playing: boolean;
  at: number;
};
/** Server orders user intents; only the latest controller samples the shared clock.
 * Remote effects are matched by value, so a genuine contrary user action is never
 * discarded just because it happened within an arbitrary suppression timeout. */
export function createRoomController(
  adapter: YTMAdapter,
  bridge: RoomBridge = createChromeRoomBridge(),
) {
  let active = false;
  let unsubscribeAdapter: (() => void) | undefined;
  let unsubscribeBridge: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let trackTimer: ReturnType<typeof setTimeout> | undefined;
  let connection = bridge.getState();
  let issue: string | null = null;
  let driftMs: number | null = null;
  let blocked = false;
  let applying = false;
  let ready = false;
  let generation = 0;
  let lastPublishedAt = 0;
  let opening: { videoId: string; at: number } | null = null;
  let pending: { id: string; at: number; next: boolean } | null = null;
  let echoes: Echo[] = [];
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const isHost = () =>
    !!connection.snapshot && connection.snapshot.hostClientId === connection.clientId;
  const isCoordinator = () =>
    !!connection.snapshot && connection.snapshot.controllerClientId === connection.clientId;
  const connected = () => active && connection.status === 'connected' && !!connection.snapshot;
  function report(result: AdapterResult) {
    if (result.ok) return true;
    if (result.error.code === 'autoplay-blocked') {
      blocked = true;
      issue =
        'Tarayıcı sesi engelledi. “Sesi etkinleştir”e bir kez bas; ardından eşitleme otomatik devam eder.';
    } else if (!blocked)
      issue = `Oynatıcı bekleniyor (${result.error.code}). Parça yüklenince eşitleme otomatik yeniden denenecek.`;
    return false;
  }
  function expect(type: Echo['type'], videoId: string, position: number, playing: boolean) {
    echoes = echoes.filter((echo) => Date.now() - echo.at < 2500);
    echoes.push({ type, videoId, position, playing, at: Date.now() });
  }
  function isEcho(event: YTMEvent): boolean {
    if (event.type !== 'play' && event.type !== 'pause' && event.type !== 'seek') return false;
    if (!event.snapshot?.track?.videoId) return false;
    const local = event.snapshot;
    echoes = echoes.filter((echo) => Date.now() - echo.at < 2500);
    const index = echoes.findIndex((echo) => {
      if (echo.type !== event.type || echo.videoId !== local.track?.videoId) return false;
      if (event.type !== 'seek') return local.playing === echo.playing;
      const expected = echo.position + (echo.playing ? Date.now() - echo.at : 0);
      return Math.abs(local.positionMs - expected) <= 800;
    });
    if (index < 0) return false;
    echoes.splice(index, 1);
    return true;
  }
  function intent(action: RoomAction) {
    if (!connected()) return;
    generation++;
    pending = { id: crypto.randomUUID(), at: Date.now(), next: action.type === 'queue.next' };
    if (pending.next || action.type === 'playback.set-track') {
      ready = false;
      opening = null;
    }
    issue = null;
    bridge.send({ type: 'command', commandId: pending.id, action });
    notify();
  }
  function heartbeat() {
    const room = connection.snapshot;
    if (
      !connected() ||
      !room ||
      !ready ||
      !isCoordinator() ||
      applying ||
      pending ||
      opening ||
      trackTimer
    )
      return;
    const local = adapter.getPlaybackSnapshot();
    if (
      !local ||
      local.buffering ||
      local.ended ||
      local.track?.videoId !== room.playback.track?.videoId ||
      local.playing !== room.playback.playing
    )
      return;
    const playback = roomPlaybackFromSnapshot(local);
    if (!playback) return;
    lastPublishedAt = Date.now();
    bridge.send({
      type: 'command',
      action: {
        type: 'playback.update',
        playback,
        playbackRevision: room.playbackRevision,
        sampledAt: local.capturedAt,
      },
    });
  }
  function next() {
    if (!connected() || !connection.snapshot || pending?.next) return;
    intent({ type: 'queue.next', playbackRevision: connection.snapshot.playbackRevision });
  }
  async function reconcile() {
    const room = connection.snapshot;
    if (!connected() || !room || applying || trackTimer) return;
    if (pending) {
      if (Date.now() - pending.at <= 8000) return;
      pending = null;
      ready = false;
      issue = 'İşlem onayı alınamadı. Güncel oda durumuna yeniden eşitleniyor.';
    }
    const version = generation;
    const current = () =>
      active && version === generation && connection.snapshot?.roomId === room.roomId;
    const target = room.playback;
    let local = adapter.getPlaybackSnapshot();
    const metadata = adapter.getTrackMetadata();
    applying = true;
    let seekOk = true;
    let playOk = true;
    try {
      if (!target.track) {
        if (local?.playing && metadata.videoId) {
          expect('pause', metadata.videoId, local.positionMs, false);
          playOk = report(await adapter.pause());
        }
        if (current()) {
          ready = playOk;
          driftMs = null;
          if (playOk) issue = null;
        }
        return;
      }
      const videoId = target.track.videoId;
      if (metadata.videoId !== videoId) {
        ready = false;
        if (opening?.videoId === videoId) {
          if (Date.now() - opening.at > 20000)
            issue =
              'Parça yüklenemedi. YouTube Music’te erişimi kontrol edip “Yeniden eşitle”ye bas.';
          return;
        }
        opening = { videoId, at: Date.now() };
        issue = 'Odadaki parça açılıyor; oda konumu yükleme boyunca korunuyor…';
        report(await adapter.openTrack(videoId));
        return;
      }
      if (!local) {
        ready = false;
        issue = 'Parçanın medya bilgileri bekleniyor…';
        return;
      }
      opening = null;
      // Pause is independent of seeking. A temporarily unavailable seek range
      // must never prevent a received pause from reaching the native player.
      if (!target.playing && local.playing) {
        expect('pause', videoId, local.positionMs, false);
        playOk = report(await adapter.pause());
        if (!current()) return;
        local = adapter.getPlaybackSnapshot() ?? local;
      }
      const position = roomPosition(room, Date.now() + connection.clockOffsetMs);
      driftMs = position - local.positionMs;
      if (
        target.playing &&
        local.ended &&
        local.durationMs !== null &&
        position >= local.durationMs - 500
      ) {
        issue = 'Sonraki parça bekleniyor…';
        return;
      }
      const tolerance = !ready || !target.playing ? 120 : 750;
      if (
        Math.abs(driftMs) > tolerance ||
        (local.ended && position < (local.durationMs ?? 0) - 1000)
      ) {
        expect('seek', videoId, position, target.playing);
        seekOk = report(await adapter.seek(position / 1000));
        if (!current()) return;
      }
      // Starting media can make a not-yet-ready seek range available. Retain
      // the target and retry the seek; never publish the temporary zero position.
      local = adapter.getPlaybackSnapshot() ?? local;
      if (target.playing && !local.playing) {
        expect('play', videoId, position, true);
        playOk = report(await adapter.play());
        if (!current()) return;
      }
      if (!current()) return;
      ready = seekOk && playOk;
      if (ready) {
        issue = null;
        blocked = false;
      }
    } finally {
      applying = false;
      if (active) notify();
    }
  }
  function stageTrack() {
    if (trackTimer) clearTimeout(trackTimer);
    generation++;
    ready = false;
    // Metadata and the media timeline need not switch in the same DOM mutation.
    trackTimer = setTimeout(() => {
      trackTimer = undefined;
      if (!connected()) return;
      const local = adapter.getPlaybackSnapshot();
      const playback = local && !local.buffering && roomPlaybackFromSnapshot(local);
      if (playback) intent({ type: 'playback.set-track', playback });
      else {
        ready = true;
        issue = 'Yeni parçanın yüklenmesi bekleniyor…';
      }
    }, 150);
  }
  function adapterEvent(event: YTMEvent) {
    if (['trackchange', 'metadatachange', 'healthchange'].includes(event.type)) notify();
    if (!connected() || event.type === 'healthchange') return;
    if (isEcho(event)) return;
    if (!ready || opening || pending?.next || trackTimer) return;
    const local = event.snapshot;
    const room = connection.snapshot!;
    if (
      local?.track?.videoId &&
      local.track.videoId !== room.playback.track?.videoId &&
      ['trackchange', 'metadatachange', 'play'].includes(event.type)
    ) {
      stageTrack();
      return;
    }
    if (!local || local.track?.videoId !== room.playback.track?.videoId) return;
    if (event.type === 'ended') {
      if (isCoordinator() && room.playback.playing) next();
      return;
    }
    // A user can press play or seek before the new buffer is ready. Waiting for
    // another playing-state delta would lose that action once buffering ends.
    if (local.ended) return;
    if (event.type === 'play' || event.type === 'pause')
      intent({ type: 'playback.set-playing', playing: local.playing });
    else if (event.type === 'seek') intent({ type: 'playback.seek', positionMs: local.positionMs });
    else if (event.type === 'metadatachange' || event.type === 'durationchange') {
      if (isCoordinator()) heartbeat();
    }
  }
  function refreshConnection() {
    const previous = connection;
    connection = bridge.getState();
    const room = connection.snapshot;
    const old = previous.snapshot;
    if (!room || !old || room.roomId !== old.roomId || previous.status !== 'connected') {
      generation++;
      ready = false;
      opening = null;
      pending = null;
      echoes = [];
      if (trackTimer) clearTimeout(trackTimer);
      trackTimer = undefined;
      if (!room) {
        issue = null;
        blocked = false;
        driftMs = null;
      }
    } else if (room.playbackRevision !== old.playbackRevision) {
      generation++;
      if (
        room.playbackEpoch !== old.playbackEpoch ||
        room.playback.track?.videoId !== old.playback.track?.videoId
      ) {
        ready = false;
        opening = null;
      }
    }
    if (
      pending &&
      connection.lastAck?.eventId === pending.id &&
      room &&
      room.revision >= connection.lastAck.revision
    )
      pending = null;
    if (connection.error && connection.error !== previous.error) {
      pending = null;
      ready = false;
    }
    notify();
    void reconcile();
  }
  async function gesture(playing: boolean) {
    const room = connection.snapshot;
    const local = adapter.getPlaybackSnapshot();
    const videoId = room?.playback.track?.videoId;
    if (!room || !videoId || local?.track?.videoId !== videoId) return;
    const position = roomPosition(room, Date.now() + connection.clockOffsetMs);
    if (Math.abs(local.positionMs - position) > 120) {
      expect('seek', videoId, position, playing);
      // seek() invokes the standard media setter synchronously, preserving the
      // click's user activation for play() even though it returns a Promise.
      void adapter.seek(position / 1000);
    }
    if (playing !== local.playing) expect(playing ? 'play' : 'pause', videoId, position, playing);
    report(await (playing ? adapter.play() : adapter.pause()));
    notify();
  }
  return {
    getState() {
      return {
        connection,
        issue,
        driftMs,
        host: isHost(),
        autoplayBlocked: blocked,
        changingTrack: !!opening || !!pending?.next,
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (active) return;
      active = true;
      ready = false;
      pending = null;
      opening = null;
      echoes = [];
      generation++;
      lastPublishedAt = Date.now();
      unsubscribeAdapter = adapter.subscribe(adapterEvent);
      unsubscribeBridge = bridge.subscribe(refreshConnection);
      bridge.start();
      refreshConnection();
      timer = setInterval(() => {
        if (
          ready &&
          !pending &&
          isCoordinator() &&
          connection.snapshot?.playback.playing &&
          adapter.getPlaybackSnapshot()?.ended
        )
          next();
        if (Date.now() - lastPublishedAt >= 3000) heartbeat();
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
      if (trackTimer) clearTimeout(trackTimer);
      trackTimer = undefined;
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
      if (!connected() || !connection.snapshot?.playback.track) return;
      const playing = !connection.snapshot.playback.playing;
      intent({ type: 'playback.set-playing', playing });
      await gesture(playing);
    },
    async resync() {
      if (!connected()) return;
      ready = false;
      blocked = false;
      issue = null;
      opening = null;
      generation++;
      if (connection.snapshot) await gesture(connection.snapshot.playback.playing);
      await reconcile();
      notify();
    },
  };
}
export type RoomController = ReturnType<typeof createRoomController>;
