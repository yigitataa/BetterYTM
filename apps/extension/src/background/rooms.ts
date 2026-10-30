import {
  DEFAULT_ROOM_SERVER,
  ROOM_PORT_NAME,
  ROOM_PROTOCOL_VERSION,
  SETTINGS_STORAGE_KEY,
  clockSample,
  estimateClock,
  normalizeRoomServer,
  roomBridgeRequestSchema,
  roomClientMessageSchema,
  roomServerMessageSchema,
  type ClockSample,
  type RoomBridgeRequest,
  type RoomClientMessage,
  type RoomConnectionState,
} from '@better-ytm/shared';

const PREFIX = 'betterYtm.room.';
type Resume = { roomId: string; token: string };
type Session = {
  tabId: number;
  state: RoomConnectionState;
  resume: Resume | null;
  ports: Set<chrome.runtime.Port>;
  socket?: WebSocket;
  reconnect?: ReturnType<typeof setTimeout>;
  heartbeat?: ReturnType<typeof setInterval>;
  detach?: ReturnType<typeof setTimeout>;
  timeout?: ReturnType<typeof setTimeout>;
  generation: number;
  attempts: number;
  samples: ClockSample[];
  pings: Map<string, number>;
  initial?: Extract<RoomBridgeRequest, { type: 'create' | 'join' }>;
  writes: Promise<void>;
};

/** One authenticated connection per YTM tab; credentials never leave the worker. */
export function registerRoomConnections() {
  let disposed = false;
  const sessions = new Map<number, Promise<Session>>();
  function post(session: Session) {
    for (const port of session.ports) {
      try {
        port.postMessage({ type: 'state', state: session.state });
      } catch {
        session.ports.delete(port);
      }
    }
  }
  function persist(session: Session) {
    const record = {
      clientId: session.state.clientId,
      serverUrl: session.state.serverUrl,
      displayName: session.state.displayName,
      panelOpen: session.state.panelOpen,
      resume: session.resume,
    };
    session.writes = session.writes
      .then(() => chrome.storage.session.set({ [`${PREFIX}${session.tabId}`]: record }))
      .catch(() => {
        session.state.error =
          'Oda oturumu saklanamadı. Sayfa yenilenirse tekrar katılman gerekebilir.';
        post(session);
      });
    return session.writes;
  }
  async function getSession(tabId: number) {
    let pending = sessions.get(tabId);
    if (!pending) {
      pending = (async () => {
        const stored = (await chrome.storage.session.get(`${PREFIX}${tabId}`))[`${PREFIX}${tabId}`];
        const value =
          stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
        const resume = value.resume as Resume | undefined;
        const session: Session = {
          tabId,
          state: {
            status: 'idle',
            clientId: typeof value.clientId === 'string' ? value.clientId : crypto.randomUUID(),
            serverUrl:
              typeof value.serverUrl === 'string'
                ? (normalizeRoomServer(value.serverUrl) ?? DEFAULT_ROOM_SERVER)
                : DEFAULT_ROOM_SERVER,
            displayName: typeof value.displayName === 'string' ? value.displayName : '',
            panelOpen: value.panelOpen === true,
            lastAck: null,
            snapshot: null,
            error: null,
            clockOffsetMs: 0,
            rttMs: null,
          },
          resume:
            resume && typeof resume.roomId === 'string' && typeof resume.token === 'string'
              ? resume
              : null,
          ports: new Set(),
          generation: 0,
          attempts: 0,
          samples: [],
          pings: new Map(),
          writes: Promise.resolve(),
        };
        return session;
      })();
      sessions.set(tabId, pending);
      void pending.catch(() => sessions.delete(tabId));
    }
    return pending;
  }
  function stopSocket(session: Session) {
    session.generation++;
    if (session.reconnect) clearTimeout(session.reconnect);
    if (session.heartbeat) clearInterval(session.heartbeat);
    if (session.timeout) clearTimeout(session.timeout);
    delete session.reconnect;
    delete session.heartbeat;
    delete session.timeout;
    const socket = session.socket;
    delete session.socket;
    socket?.close();
    session.pings.clear();
  }
  function envelope(session: Session) {
    return {
      protocolVersion: ROOM_PROTOCOL_VERSION as typeof ROOM_PROTOCOL_VERSION,
      eventId: crypto.randomUUID(),
      originClientId: session.state.clientId,
      sentAt: Date.now(),
    };
  }
  function send(session: Session, message: RoomClientMessage) {
    if (session.socket?.readyState !== WebSocket.OPEN) return false;
    const parsed = roomClientMessageSchema.safeParse(message);
    if (!parsed.success) {
      session.state.error = 'Geçersiz oda işlemi.';
      post(session);
      return false;
    }
    session.socket.send(JSON.stringify(parsed.data));
    return true;
  }
  function ping(session: Session) {
    const message: RoomClientMessage = { ...envelope(session), type: 'ping' };
    if (session.pings.size > 10) {
      session.socket?.close();
      return;
    }
    session.pings.set(message.eventId, message.sentAt);
    send(session, message);
  }
  function clearRoom(session: Session, error: string | null = null) {
    session.resume = null;
    session.state.clientId = crypto.randomUUID();
    delete session.initial;
    stopSocket(session);
    session.state.snapshot = null;
    session.state.lastAck = null;
    session.state.status = error ? 'error' : 'idle';
    session.state.error = error;
    void persist(session);
    post(session);
  }
  function connect(session: Session) {
    stopSocket(session);
    if (!session.resume && !session.initial) return;
    const generation = session.generation;
    session.state.status = session.resume ? 'reconnecting' : 'connecting';
    session.state.error = null;
    post(session);
    let socket: WebSocket;
    try {
      socket = new WebSocket(session.state.serverUrl);
    } catch {
      session.state.status = 'error';
      session.state.error = 'Sunucu adresi açılamadı.';
      post(session);
      return;
    }
    session.socket = socket;
    const current = () => session.generation === generation && session.socket === socket;
    session.timeout = setTimeout(() => {
      if (current()) socket.close();
    }, 10000);
    socket.onopen = () => {
      if (!current()) return;
      const initial = session.initial;
      const auth: RoomClientMessage | null = session.resume
        ? { ...envelope(session), type: 'room.resume', ...session.resume }
        : initial?.type === 'create'
          ? {
              ...envelope(session),
              type: 'room.create',
              displayName: initial.displayName,
              playback: initial.playback,
            }
          : initial?.type === 'join'
            ? {
                ...envelope(session),
                type: 'room.join',
                displayName: initial.displayName,
                code: initial.code,
              }
            : null;
      if (auth) send(session, auth);
      session.samples = [];
      session.pings.clear();
      // Five clock samples; each message also counts as worker activity.
      for (let i = 0; i < 5; i++)
        setTimeout(() => {
          if (current()) ping(session);
        }, i * 150);
      session.heartbeat = setInterval(() => {
        if (!current()) return;
        if ([...session.pings.values()].some((sent) => Date.now() - sent > 45000)) {
          socket.close();
          return;
        }
        ping(session);
      }, 20000);
    };
    socket.onmessage = (event) => {
      if (!current() || typeof event.data !== 'string' || event.data.length > 524288) return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = roomServerMessageSchema.safeParse(raw);
      if (!parsed.success) {
        clearRoom(
          session,
          'Sunucu ve eklenti protokolleri farklı. Render sunucusunu ve iki eklentiyi de güncelle.',
        );
        return;
      }
      const message = parsed.data;
      if (message.type === 'pong') {
        const sent = session.pings.get(message.eventId);
        session.pings.delete(message.eventId);
        if (sent === undefined) return;
        const sample = clockSample(sent, Date.now(), message.serverTimeMs);
        if (sample) {
          session.samples.push(sample);
          session.samples = session.samples.slice(-15);
          const estimate = estimateClock(session.samples);
          session.state.clockOffsetMs = estimate.offset;
          session.state.rttMs = estimate.rtt;
          post(session);
        }
      } else if (message.type === 'room.welcome') {
        if (message.clientId !== session.state.clientId) {
          clearRoom(session, 'Sunucu farklı bir istemci kimliği döndürdü.');
          return;
        }
        session.resume = { roomId: message.snapshot.roomId, token: message.token };
        delete session.initial;
        session.state.snapshot = message.snapshot;
        session.state.error = null;
        session.attempts = 0;
        if (session.timeout) clearTimeout(session.timeout);
        delete session.timeout;
        void persist(session).then(() => {
          if (!current() || !session.resume) return;
          session.state.status = 'connected';
          post(session);
          send(session, { ...envelope(session), type: 'room.sync', roomId: session.resume.roomId });
        });
      } else if (message.type === 'room.snapshot') {
        const previous = session.state.snapshot;
        if (
          session.state.status !== 'connected' ||
          !session.resume ||
          message.roomId !== session.resume.roomId ||
          (previous && message.revision < previous.revision)
        )
          return;
        session.state.snapshot = message.snapshot;
        post(session);
      } else if (message.type === 'room.error') {
        if (
          ['room-closed', 'not-found', 'unauthorized', 'protocol-mismatch'].includes(message.code)
        )
          clearRoom(session, message.message);
        else if (session.state.status !== 'connected')
          clearRoom(
            session,
            message.code === 'invalid-message'
              ? 'Sunucu ve eklenti protokolleri farklı olabilir. Render sunucusunu ve iki eklentiyi de güncelle.'
              : message.message,
          );
        else {
          session.state.error = message.message;
          post(session);
        }
      } else if (message.type === 'command.ack') {
        session.state.lastAck = { eventId: message.eventId, revision: message.revision };
        session.state.error = null;
        post(session);
      }
    };
    socket.onerror = () => {
      /* onclose owns retry; never print URLs or credentials. */
    };
    socket.onclose = (event) => {
      if (!current()) return;
      stopSocket(session);
      if (event.code === 4001) {
        clearRoom(session, 'Oda bağlantısı başka bir oturumda açıldı.');
        return;
      }
      if (!session.ports.size || (!session.resume && !session.initial)) return;
      session.attempts++;
      if (!session.resume && session.attempts >= 3) {
        clearRoom(session, 'Sunucuya bağlanılamadı. Sunucunun çalıştığını ve adresini kontrol et.');
        return;
      }
      session.state.status = 'reconnecting';
      session.state.error = 'Bağlantı kesildi. Odaya yeniden bağlanılıyor…';
      post(session);
      session.reconnect = setTimeout(
        () => connect(session),
        Math.min(15000, 1000 * 2 ** Math.min(session.attempts - 1, 4)) + Math.random() * 300,
      );
    };
  }
  async function request(session: Session, message: RoomBridgeRequest) {
    if (message.type === 'panel') {
      session.state.panelOpen = message.open;
      await persist(session);
      return;
    }
    if (message.type === 'leave') {
      if (session.resume)
        send(session, { ...envelope(session), type: 'room.leave', roomId: session.resume.roomId });
      clearRoom(session);
      return;
    }
    if (message.type === 'retry') {
      if (session.resume || session.initial) connect(session);
      return;
    }
    if (message.type === 'create' || message.type === 'join') {
      if (session.resume || session.state.status === 'connecting') {
        session.state.error = 'Önce mevcut odadan ayrıl.';
        post(session);
        return;
      }
      const url = normalizeRoomServer(message.serverUrl);
      if (!url) {
        session.state.error = 'Geçerli bir WSS sunucu adresi veya yerel WS adresi gir.';
        post(session);
        return;
      }
      session.state.serverUrl = url;
      session.state.displayName = message.displayName;
      session.initial = message;
      session.attempts = 0;
      await persist(session);
      connect(session);
      return;
    }
    if (!session.resume || session.state.status !== 'connected') {
      session.state.error = 'İşlem için oda bağlantısının kurulmasını bekle.';
      post(session);
      return;
    }
    session.state.error = null;
    const action =
      message.action.type === 'playback.update'
        ? {
            ...message.action,
            sampledAt: Math.round(message.action.sampledAt + session.state.clockOffsetMs),
          }
        : message.action;
    const sent = send(session, {
      ...envelope(session),
      type: 'room.command',
      ...(message.commandId ? { eventId: message.commandId } : {}),
      roomId: session.resume.roomId,
      baseRevision: session.state.snapshot?.revision ?? 0,
      action,
    });
    if (!sent) {
      session.state.error = 'İşlem gönderilemedi; yeniden bağlanmayı bekle.';
      post(session);
    }
  }
  chrome.runtime.onConnect.addListener((port) => {
    if (disposed) return;
    const tabId = port.sender?.tab?.id;
    if (
      port.name !== ROOM_PORT_NAME ||
      port.sender?.id !== chrome.runtime.id ||
      tabId === undefined ||
      port.sender.frameId !== 0 ||
      !port.sender.url?.startsWith('https://music.youtube.com/')
    )
      return;
    let active = true;
    port.onDisconnect.addListener(() => {
      active = false;
      const pending = sessions.get(tabId);
      if (disposed || !pending) return;
      void pending.then((session) => {
        if (disposed) return;
        session.ports.delete(port);
        if (session.detach) clearTimeout(session.detach);
        if (!session.ports.size)
          session.detach = setTimeout(() => {
            if (!session.ports.size) stopSocket(session);
          }, 15000);
      });
    });
    // Serialized by the port's per-session promise chain, including initial storage load.
    let operations = getSession(tabId).then((session) => {
      if (!active) return session;
      if (session.detach) clearTimeout(session.detach);
      session.ports.add(port);
      post(session);
      if (session.resume && !session.socket && !session.reconnect) connect(session);
      return session;
    });
    port.onMessage.addListener((raw: unknown) => {
      const parsed = roomBridgeRequestSchema.safeParse(raw);
      if (!parsed.success) return;
      operations = operations
        .then(async (session) => {
          if (!disposed && (active || parsed.data.type === 'leave'))
            await request(session, parsed.data);
          return session;
        })
        .catch(() => {
          try {
            port.postMessage({
              type: 'bridge-error',
              message: 'Oda oturumu açılamadı. Sayfayı yenileyip tekrar dene.',
            });
          } catch {
            /* disconnected */
          }
          return getSession(tabId);
        });
    });
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (disposed) return;
    const pending = sessions.get(tabId);
    sessions.delete(tabId);
    if (pending)
      void pending.then(async (session) => {
        if (session.resume)
          send(session, {
            ...envelope(session),
            type: 'room.leave',
            roomId: session.resume.roomId,
          });
        stopSocket(session);
        if (session.detach) clearTimeout(session.detach);
        await session.writes;
        await chrome.storage.session.remove(`${PREFIX}${tabId}`);
      });
    else void chrome.storage.session.remove(`${PREFIX}${tabId}`);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (disposed) return;
    const value: unknown = changes[SETTINGS_STORAGE_KEY]?.newValue;
    if (
      area !== 'local' ||
      !value ||
      typeof value !== 'object' ||
      !('enabled' in value) ||
      value.enabled !== false
    )
      return;
    // Also erase credentials left by a dormant/restarted worker, not just live sessions.
    void Promise.all(
      [...sessions.values()].map(async (pending) => {
        const session = await pending;
        await request(session, { type: 'leave' });
        await session.writes;
      }),
    )
      .then(async () => {
        const stored = await chrome.storage.session.get(null);
        const keys = Object.keys(stored).filter((key) => key.startsWith(PREFIX));
        if (keys.length) await chrome.storage.session.remove(keys);
      })
      .catch(() => console.error('[Better YTM] Room credentials could not be cleared.'));
  });
  return {
    async dispose() {
      disposed = true;
      for (const pending of sessions.values()) {
        const session = await pending;
        session.ports.clear();
        stopSocket(session);
        if (session.detach) clearTimeout(session.detach);
        await session.writes;
      }
      sessions.clear();
    },
  };
}
