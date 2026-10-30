import {
  DEFAULT_ROOM_SERVER,
  ROOM_PORT_NAME,
  roomConnectionStateSchema,
  type RoomBridgeRequest,
  type RoomConnectionState,
} from '@better-ytm/shared';

export interface RoomBridge {
  getState(): RoomConnectionState;
  subscribe(listener: () => void): () => void;
  send(request: RoomBridgeRequest): void;
  start(): void;
  stop(): void;
}
export function createChromeRoomBridge(): RoomBridge {
  let state: RoomConnectionState = {
    status: 'idle',
    clientId: 'pending',
    snapshot: null,
    serverUrl: DEFAULT_ROOM_SERVER,
    displayName: '',
    error: null,
    clockOffsetMs: 0,
    rttMs: null,
    panelOpen: false,
    lastAck: null,
  };
  let port: chrome.runtime.Port | undefined;
  let active = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function notify() {
    for (const listener of listeners) listener();
  }
  function connect() {
    if (!active || port) return;
    try {
      const next = chrome.runtime.connect({ name: ROOM_PORT_NAME });
      port = next;
      next.onMessage.addListener((message: unknown) => {
        if (port !== next || !message || typeof message !== 'object') return;
        if ('type' in message && message.type === 'state' && 'state' in message) {
          const parsed = roomConnectionStateSchema.safeParse(message.state);
          if (parsed.success) {
            state = parsed.data;
            notify();
          }
        } else if ('type' in message && message.type === 'bridge-error') {
          state = { ...state, status: 'error', error: 'Oda bağlantısı açılamadı. Sayfayı yenile.' };
          notify();
        }
      });
      next.onDisconnect.addListener(() => {
        // Read lastError to avoid an unchecked runtime error after worker shutdown.
        void chrome.runtime.lastError;
        if (port !== next) return;
        port = undefined;
        if (active) {
          state = { ...state, status: 'reconnecting', error: 'Eklenti bağlantısı yenileniyor…' };
          notify();
          retry = setTimeout(connect, 1000);
        }
      });
    } catch {
      state = {
        ...state,
        status: 'error',
        error: 'Eklenti yeniden yüklendi. YouTube Music sekmesini yenile.',
      };
      notify();
    }
  }
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      if (!port) {
        state = { ...state, error: 'Eklenti bağlantısını bekle veya sayfayı yenile.' };
        notify();
        return;
      }
      try {
        port.postMessage(message);
      } catch {
        state = { ...state, error: 'İşlem gönderilemedi. Sayfayı yenile.' };
        notify();
      }
    },
    start() {
      if (active) return;
      active = true;
      connect();
    },
    stop() {
      active = false;
      if (retry) clearTimeout(retry);
      const previous = port;
      port = undefined;
      previous?.disconnect();
    },
  };
}
