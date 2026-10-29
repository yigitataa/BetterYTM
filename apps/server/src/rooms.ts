import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import {
  roomClientMessageSchema,
  roomPosition,
  type RoomClientMessage,
  type RoomPlayback,
  type RoomSnapshot,
  type RoomServerMessage,
} from '@better-ytm/shared';

type Member = {
  clientId: string;
  displayName: string;
  token: string;
  socket: WebSocket | null;
  disconnectedAt: number | null;
};
type Room = {
  state: RoomSnapshot;
  members: Map<string, Member>;
  createdAt: number;
  seen: Set<string>;
};
type Connection = { room?: Room; member?: Member; count: number; window: number; alive: boolean };
export interface RoomServerOptions {
  /** Explicit browser origins for controlled fixtures or a separately hosted client. */
  allowedOrigins?: readonly string[];
  disconnectGraceMs?: number;
  roomTtlMs?: number;
  sweepMs?: number;
  maxRooms?: number;
}

export function attachRoomServer(server: Server, options: RoomServerOptions = {}) {
  const rooms = new Map<string, Room>();
  const codes = new Map<string, Room>();
  const connections = new Map<WebSocket, Connection>();
  const admission = new Map<string, { count: number; since: number }>();
  const wsServer = new WebSocketServer({
    noServer: true,
    maxPayload: 16384,
    perMessageDeflate: false,
  });
  const grace = options.disconnectGraceMs ?? 90000;
  const ttl = options.roomTtlMs ?? 6 * 60 * 60 * 1000;
  const maxRooms = options.maxRooms ?? 1000;
  let closed = false;

  function send(socket: WebSocket, message: RoomServerMessage) {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 524288) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(message));
  }
  function error(
    socket: WebSocket,
    code: Extract<RoomServerMessage, { type: 'room.error' }>['code'],
    message: string,
    eventId?: string,
  ) {
    send(socket, { type: 'room.error', code, message, ...(eventId ? { eventId } : {}) });
  }
  function snapshot(room: Room): RoomSnapshot {
    const now = Date.now();
    return {
      ...room.state,
      serverTimeMs: now,
      playback: { ...room.state.playback, positionMs: roomPosition(room.state, now) },
      members: [...room.members.values()].map(({ clientId, displayName, socket }) => ({
        clientId,
        displayName,
        connected: !!socket,
      })),
    };
  }
  function broadcast(room: Room, originClientId = 'server') {
    const state = snapshot(room);
    const event: RoomServerMessage = {
      protocolVersion: 1,
      type: 'room.snapshot',
      eventId: randomUUID(),
      roomId: state.roomId,
      originClientId,
      sentAt: state.serverTimeMs,
      revision: state.revision,
      snapshot: state,
    };
    for (const member of room.members.values()) if (member.socket) send(member.socket, event);
  }
  function endRoom(room: Room) {
    rooms.delete(room.state.roomId);
    codes.delete(room.state.code);
    for (const member of room.members.values())
      if (member.socket) {
        error(
          member.socket,
          'room-closed',
          'Oda sona erdi. Yeni bir oda oluşturabilir veya başka bir odaya katılabilirsin.',
        );
        member.socket.close(1000, 'Room ended');
      }
  }
  function newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = [...randomBytes(10)].map((byte) => alphabet[byte % alphabet.length]).join('');
    } while (codes.has(code));
    return code;
  }
  function authorized(
    socket: WebSocket,
    connection: Connection,
    message: Extract<RoomClientMessage, { roomId: string }>,
  ): connection is Connection & { room: Room; member: Member } {
    if (
      !connection.room ||
      !connection.member ||
      connection.member.socket !== socket ||
      connection.room.state.roomId !== message.roomId ||
      connection.member.clientId !== message.originClientId ||
      !rooms.has(message.roomId)
    ) {
      error(socket, 'unauthorized', 'Oda oturumu doğrulanamadı.', message.eventId);
      return false;
    }
    return true;
  }
  function welcome(socket: WebSocket, connection: Connection, room: Room, member: Member) {
    // Replacing an old connection must not let its later close handler mark the new one offline.
    const previous = member.socket;
    member.socket = socket;
    member.disconnectedAt = null;
    connection.room = room;
    connection.member = member;
    if (previous && previous !== socket) previous.close(4001, 'Connection replaced');
    room.state.revision++;
    send(socket, {
      type: 'room.welcome',
      clientId: member.clientId,
      token: member.token,
      snapshot: snapshot(room),
    });
    broadcast(room, member.clientId);
  }
  function setPlayback(room: Room, playback: RoomPlayback) {
    room.state.playback = playback;
    room.state.serverTimeMs = Date.now();
  }
  function handle(socket: WebSocket, connection: Connection, message: RoomClientMessage) {
    if (message.type === 'ping') {
      send(socket, {
        type: 'pong',
        eventId: message.eventId,
        sentAt: message.sentAt,
        serverTimeMs: Date.now(),
      });
      return;
    }
    if (
      message.type === 'room.create' ||
      message.type === 'room.join' ||
      message.type === 'room.resume'
    ) {
      if (connection.member) {
        error(socket, 'invalid-message', 'Bu bağlantı zaten bir odada.', message.eventId);
        return;
      }
      if (message.type === 'room.resume') {
        const room = rooms.get(message.roomId);
        const member = room?.members.get(message.originClientId);
        if (!room || !member) {
          error(socket, 'not-found', 'Oda veya oturum artık mevcut değil.', message.eventId);
          return;
        }
        const expected = Buffer.from(member.token);
        const received = Buffer.from(message.token);
        if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
          error(socket, 'unauthorized', 'Oda oturumu doğrulanamadı.', message.eventId);
          return;
        }
        welcome(socket, connection, room, member);
        return;
      }
      if (message.type !== 'room.create' && message.type !== 'room.join') return;
      let room: Room;
      if (message.type === 'room.create') {
        if (rooms.size >= maxRooms) {
          error(socket, 'full', 'Sunucu oda sınırına ulaştı.', message.eventId);
          return;
        }
        const now = Date.now();
        room = {
          state: {
            roomId: randomUUID(),
            code: newCode(),
            revision: 0,
            playbackEpoch: 0,
            serverTimeMs: now,
            hostClientId: message.originClientId,
            members: [],
            queue: [],
            playback: message.playback,
          },
          members: new Map(),
          createdAt: now,
          seen: new Set(),
        };
        rooms.set(room.state.roomId, room);
        codes.set(room.state.code, room);
      } else {
        const found = codes.get(message.code);
        if (!found) {
          error(
            socket,
            'not-found',
            'Oda bulunamadı. Kodu ve sunucu adresini kontrol et.',
            message.eventId,
          );
          return;
        }
        room = found;
      }
      if (room.members.size >= 50) {
        error(socket, 'full', 'Oda dolu (en fazla 50 kişi).', message.eventId);
        return;
      }
      if (room.members.has(message.originClientId)) {
        error(
          socket,
          'unauthorized',
          'Bu istemci için oturumu sürdürme anahtarı gerekli.',
          message.eventId,
        );
        return;
      }
      const member: Member = {
        clientId: message.originClientId,
        displayName: message.displayName,
        token: randomBytes(32).toString('base64url'),
        socket: null,
        disconnectedAt: null,
      };
      room.members.set(member.clientId, member);
      welcome(socket, connection, room, member);
      return;
    }
    if (!('roomId' in message) || !authorized(socket, connection, message)) return;
    const { room, member } = connection;
    if (message.type === 'room.sync') {
      broadcast(room, member.clientId);
      return;
    }
    if (message.type === 'room.leave') {
      if (member.clientId === room.state.hostClientId) endRoom(room);
      else {
        room.members.delete(member.clientId);
        room.state.revision++;
        broadcast(room, member.clientId);
      }
      socket.close(1000, 'Left room');
      return;
    }
    const key = `${member.clientId}:${message.eventId}`;
    if (room.seen.has(key)) {
      send(socket, {
        type: 'command.ack',
        eventId: message.eventId,
        revision: room.state.revision,
      });
      return;
    }
    const action = message.action;
    const host = member.clientId === room.state.hostClientId;
    if (action.type !== 'queue.add' && !host) {
      error(socket, 'forbidden', 'Bu işlemi yalnızca oda sahibi yapabilir.', message.eventId);
      return;
    }
    if (
      action.type !== 'queue.add' &&
      action.type !== 'playback.update' &&
      message.baseRevision !== room.state.revision
    ) {
      error(socket, 'conflict', 'Oda güncellendi; güncel sırayla yeniden dene.', message.eventId);
      broadcast(room);
      return;
    }
    if (action.type === 'playback.update') setPlayback(room, action.playback);
    else if (action.type === 'queue.add') {
      if (room.state.queue.length >= 200) {
        error(socket, 'full', 'Sırada en fazla 200 parça olabilir.', message.eventId);
        return;
      }
      room.state.queue.push({
        id: randomUUID(),
        track: action.track,
        addedByClientId: member.clientId,
      });
    } else if (action.type === 'queue.next') {
      const next = room.state.queue.shift();
      const current = snapshot(room).playback;
      setPlayback(
        room,
        next
          ? { track: next.track, playing: true, positionMs: 0, durationMs: null }
          : { ...current, playing: false },
      );
      room.state.playbackEpoch++;
    } else {
      const index = room.state.queue.findIndex(({ id }) => id === action.entryId);
      if (index < 0) {
        error(socket, 'conflict', 'Bu parça artık sırada değil.', message.eventId);
        broadcast(room);
        return;
      }
      if (action.type === 'queue.remove') room.state.queue.splice(index, 1);
      else {
        const target = index + (action.direction === 'up' ? -1 : 1);
        if (target >= 0 && target < room.state.queue.length)
          [room.state.queue[index], room.state.queue[target]] = [
            room.state.queue[target]!,
            room.state.queue[index]!,
          ];
      }
    }
    room.seen.add(key);
    if (room.seen.size > 512) room.seen.delete(room.seen.values().next().value!);
    room.state.revision++;
    send(socket, { type: 'command.ack', eventId: message.eventId, revision: room.state.revision });
    broadcast(room, member.clientId);
  }

  server.on('upgrade', (request, socket, head) => {
    const origin = request.headers.origin;
    const allowedOrigin =
      !origin ||
      /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
      options.allowedOrigins?.includes(origin);
    if (closed || request.url !== '/ws' || !allowedOrigin || connections.size >= 2000) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const address = request.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    let bucket = admission.get(address);
    if (!bucket || now - bucket.since > 60000) {
      bucket = { count: 0, since: now };
      admission.set(address, bucket);
    }
    if (++bucket.count > 60) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
      return;
    }
    wsServer.handleUpgrade(request, socket, head, (ws) => wsServer.emit('connection', ws));
  });
  wsServer.on('connection', (socket) => {
    const connection: Connection = { count: 0, window: Date.now(), alive: true };
    connections.set(socket, connection);
    const handshakeTimeout = setTimeout(() => {
      if (!connection.member) socket.close(1008, 'Handshake timeout');
    }, 10000);
    handshakeTimeout.unref();
    socket.on('error', () => socket.terminate());
    socket.on('pong', () => {
      connection.alive = true;
    });
    socket.on('message', (raw, binary) => {
      const now = Date.now();
      if (now - connection.window > 10000) {
        connection.window = now;
        connection.count = 0;
      }
      if (++connection.count > 100) {
        error(socket, 'rate-limit', 'Çok fazla işlem. Birkaç saniye sonra yeniden dene.');
        socket.close(1008, 'Rate limit');
        return;
      }
      try {
        const parsed = !binary && roomClientMessageSchema.safeParse(JSON.parse(raw.toString()));
        if (!parsed || !parsed.success) {
          error(socket, 'invalid-message', 'Geçersiz oda mesajı.');
          return;
        }
        handle(socket, connection, parsed.data);
        if (connection.member) clearTimeout(handshakeTimeout);
      } catch {
        error(socket, 'invalid-message', 'Oda mesajı okunamadı.');
      }
    });
    socket.on('close', () => {
      clearTimeout(handshakeTimeout);
      connections.delete(socket);
      const { room, member } = connection;
      if (room && member && member.socket === socket && room.members.has(member.clientId)) {
        member.socket = null;
        member.disconnectedAt = Date.now();
        room.state.revision++;
        if (rooms.has(room.state.roomId)) broadcast(room);
      }
    });
  });
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [address, bucket] of admission)
      if (now - bucket.since > 60000) admission.delete(address);
    for (const room of rooms.values()) {
      const host = room.members.get(room.state.hostClientId);
      if (
        now - room.createdAt > ttl ||
        (host?.disconnectedAt !== null &&
          host?.disconnectedAt !== undefined &&
          now - host.disconnectedAt > grace)
      ) {
        endRoom(room);
        continue;
      }
      let changed = false;
      for (const member of room.members.values())
        if (
          member.clientId !== room.state.hostClientId &&
          member.disconnectedAt !== null &&
          now - member.disconnectedAt > grace
        ) {
          room.members.delete(member.clientId);
          changed = true;
        }
      if (changed) {
        room.state.revision++;
        broadcast(room);
      }
    }
  }, options.sweepMs ?? 10000);
  sweep.unref();
  const heartbeat = setInterval(() => {
    for (const [socket, connection] of connections) {
      if (!connection.alive) {
        socket.terminate();
        continue;
      }
      connection.alive = false;
      socket.ping();
    }
  }, 20000);
  heartbeat.unref();
  return {
    close() {
      closed = true;
      clearInterval(sweep);
      clearInterval(heartbeat);
      for (const socket of connections.keys()) socket.terminate();
      wsServer.close();
    },
    get roomCount() {
      return rooms.size;
    },
  };
}
