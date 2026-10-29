import { parseRoomInvite, roomInvite, trackFromRoomInput } from '@better-ytm/shared';
import type { YTMAdapter } from '@better-ytm/ytm-adapter';
import type { RoomController } from './controller.js';
import { LISTEN_TOGETHER_CSS } from './styles.js';

/** Accessible, isolated room UI. Networking and player synchronization live in the controller. */
export function createListenTogetherPage(
  document: Document,
  adapter: YTMAdapter,
  controller: RoomController,
) {
  let host: HTMLDivElement | undefined;
  let dialog: HTMLDialogElement | undefined;
  let returnFocus: Element | null = null;
  let render: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let started = false;
  let closedByUser = false;
  const initialInvite = parseRoomInvite(document.location.href);
  const view = document.defaultView;
  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string,
  ) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(label: string, action: () => void, className = '') {
    const node = element('button', label, className);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function close(user = true) {
    if (user) {
      closedByUser = true;
      controller.setPanelOpen(false);
    }
    const previous = dialog;
    dialog = undefined;
    previous?.close();
    host?.remove();
    host = undefined;
    render = undefined;
    if (view && returnFocus instanceof view.HTMLElement && returnFocus.isConnected)
      returnFocus.focus();
    returnFocus = null;
  }
  function open() {
    if (dialog?.open) return;
    closedByUser = false;
    controller.setPanelOpen(true);
    returnFocus = document.activeElement;
    host = element('div');
    host.id = 'better-ytm-listen-together';
    const shadow = host.attachShadow({ mode: 'open' });
    dialog = element('dialog');
    dialog.lang = 'tr';
    dialog.setAttribute('aria-labelledby', 'together-heading');
    const screen = dialog;
    const header = element('header');
    const heading = element('h1', 'Birlikte Dinle');
    heading.id = 'together-heading';
    const closeButton = button('×', () => close(), 'close');
    closeButton.setAttribute('aria-label', 'Birlikte Dinle ekranını kapat');
    header.append(heading, closeButton);
    const main = element('main');
    const status = element('p', '', 'status');
    status.setAttribute('role', 'status');
    const error = element('p', '', 'error');
    error.setAttribute('role', 'alert');
    const offline = element('section', '', 'welcome');
    offline.append(
      element('h2', 'Aynı şarkıda buluşalım.'),
      element(
        'p',
        'Bir oda aç veya davetle katıl. Herkes kendi cihazında dinler, sırayı birlikte oluşturursunuz.',
        'lead',
      ),
    );
    const form = element('form');
    function field(label: string, placeholder: string, id: string) {
      const wrapper = element('label', label);
      wrapper.htmlFor = id;
      const input = element('input');
      input.id = id;
      input.placeholder = placeholder;
      input.autocomplete = 'off';
      wrapper.append(input);
      return { wrapper, input };
    }
    const name = field('Görünen adın', 'Örneğin Yiğit', 'bytm-room-name');
    name.input.required = true;
    name.input.maxLength = 60;
    const invite = field(
      'Oda kodu veya davet bağlantısı',
      'ABCDEFGHIJ veya davet bağlantısı',
      'bytm-room-code',
    );
    invite.input.maxLength = 4096;
    if (initialInvite) invite.input.value = document.location.href;
    const server = field('Oda sunucusu', 'wss://sunucu-adresi/ws', 'bytm-room-server');
    server.input.required = true;
    server.input.maxLength = 2048;
    server.input.spellcheck = false;
    const advanced = element('details');
    advanced.append(
      element('summary', 'Sunucu bağlantısı'),
      server.wrapper,
      element(
        'p',
        'Aynı odadaki herkes aynı sunucuya bağlanır. Yerel test: ws://127.0.0.1:8787/ws',
        'hint',
      ),
    );
    let dirtyName = false;
    let dirtyServer = false;
    name.input.addEventListener('input', () => {
      dirtyName = true;
    });
    server.input.addEventListener('input', () => {
      dirtyServer = true;
    });
    const create = element('button', 'Oda oluştur', 'primary');
    create.type = 'submit';
    create.dataset.operation = 'create';
    const join = element('button', 'Odaya katıl');
    join.type = 'submit';
    join.dataset.operation = 'join';
    const actions = element('div', '', 'actions');
    actions.append(create, join);
    let notice = '';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      notice = '';
      const operation = (event as SubmitEvent).submitter?.getAttribute('data-operation');
      const displayName = name.input.value.trim();
      if (!displayName) {
        notice = 'Görünen adını gir.';
        render?.();
        return;
      }
      if (operation === 'join')
        controller.join(server.input.value, displayName, invite.input.value);
      else controller.create(server.input.value, displayName);
    });
    form.append(name.wrapper, invite.wrapper, advanced, actions);
    offline.append(form);
    const cancel = button('Bağlantıyı iptal et', () => controller.leave());
    offline.append(cancel);
    const roomView = element('section');
    const roomHeader = element('div', '', 'room-heading');
    const roomName = element('h2');
    const code = element('p', '', 'room-code');
    roomHeader.append(roomName, code);
    const invitation = element('input');
    invitation.readOnly = true;
    invitation.setAttribute('aria-label', 'Davet bağlantısı');
    invitation.addEventListener('focus', () => invitation.select());
    const copy = button('Daveti kopyala', () => {
      const fallback = () => {
        invitation.focus();
        invitation.select();
        notice = 'Bağlantıyı seçtim. Kopyalamak için Ctrl/Cmd+C kullan.';
        render?.();
      };
      const copying = view?.navigator.clipboard?.writeText(invitation.value);
      if (copying)
        void copying
          .then(() => {
            notice = 'Davet bağlantısı kopyalandı.';
            render?.();
          })
          .catch(fallback);
      else fallback();
    });
    const invitationRow = element('div', '', 'invite-row');
    invitationRow.append(invitation, copy);
    const localHint = element('p', '', 'hint');
    const columns = element('div', '', 'workspace');
    const queueSection = element('section');
    const queueTitle = element('h3', 'Ortak sıra');
    const addForm = element('form', '', 'add-form');
    const urlField = field(
      'Sıraya şarkı ekle',
      'YouTube Music bağlantısı veya video ID',
      'bytm-room-track',
    );
    urlField.input.required = true;
    urlField.input.maxLength = 2048;
    const add = element('button', 'Ekle', 'primary');
    add.type = 'submit';
    addForm.append(urlField.wrapper, add);
    addForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const track = trackFromRoomInput(urlField.input.value);
      if (!track) {
        notice = 'Geçerli bir YouTube şarkı bağlantısı veya 11 karakterli video ID gir.';
        render?.();
        return;
      }
      notice = '';
      controller.addTrack(track);
      urlField.input.value = '';
    });
    const addCurrent = button('Sende çalanı sıraya ekle', () => {
      notice = '';
      controller.addCurrent();
    });
    const queue = element('ol', '', 'queue');
    const empty = element('p', 'Sıra boş. Bir şarkı bağlantısı ekleyerek başlayabilirsin.', 'hint');
    queueSection.append(queueTitle, addForm, addCurrent, empty, queue);
    const sidebar = element('aside');
    const player = element('section', '', 'player');
    const artwork = element('img');
    artwork.alt = '';
    artwork.referrerPolicy = 'no-referrer';
    artwork.hidden = true;
    artwork.addEventListener('error', () => {
      artwork.hidden = true;
    });
    const title = element('p', '', 'title');
    const artist = element('p', '', 'artist');
    const playback = element('p', '', 'hint');
    const sync = element('p', '', 'hint');
    const toggle = button(
      'Oynat',
      () => {
        void controller.togglePlayback();
      },
      'primary',
    );
    const next = button('Sıradakini çal', () => controller.next());
    const syncButton = button('Senkronu başlat', () => {
      void controller.resync();
    });
    const retry = button('Yeniden bağlan', () => controller.retry());
    const controls = element('div', '', 'actions');
    controls.append(toggle, next, syncButton, retry);
    player.append(element('h3', 'Odada çalan'), artwork, title, artist, playback, sync, controls);
    const membersTitle = element('h3', 'Dinleyiciler');
    const members = element('ul', '', 'members');
    const leave = button('Odadan ayrıl', () => controller.leave(), 'leave');
    sidebar.append(player, membersTitle, members, leave);
    columns.append(queueSection, sidebar);
    roomView.append(roomHeader, invitationRow, localHint, columns);
    main.append(status, error, offline, roomView);
    const footer = element(
      'footer',
      'Parça bilgisi, çalma konumu ve ortak sıra seçtiğin sunucuya iletilir. Ses her zaman kendi YouTube Music hesabından çalar.',
    );
    dialog.append(header, main, footer);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener('close', () => {
      if (dialog === screen) close();
    });
    shadow.append(element('style', LISTEN_TOGETHER_CSS), dialog);
    document.body.append(host);
    let queueSignature = '';
    let membersSignature = '';
    render = () => {
      const state = controller.getState();
      const connection = state.connection;
      const room = connection.snapshot;
      const connected = connection.status === 'connected';
      const loading = connection.status === 'connecting' || connection.status === 'reconnecting';
      const statuses = {
        idle: 'Birlikte dinlemeye hazır',
        connecting: 'Odaya bağlanılıyor…',
        connected: 'Odaya bağlı',
        reconnecting: 'Yeniden bağlanılıyor…',
        error: 'Oda bağlantısı kapalı',
      };
      if (status.textContent !== statuses[connection.status])
        status.textContent = statuses[connection.status];
      const message = connection.error || state.issue || notice || '';
      if (error.textContent !== message) error.textContent = message;
      error.hidden = !message;
      offline.hidden = !!room;
      roomView.hidden = !room;
      create.disabled = join.disabled = loading;
      cancel.hidden = !loading;
      if (!dirtyName) name.input.value = connection.displayName;
      if (!dirtyServer) server.input.value = initialInvite?.serverUrl ?? connection.serverUrl;
      if (!room) return;
      roomName.textContent = state.host ? 'Senin odan' : 'Birlikte dinliyorsunuz';
      code.textContent = `${room.code.slice(0, 5)}-${room.code.slice(5)}`;
      invitation.value = roomInvite(connection.serverUrl, room.code);
      localHint.textContent = connection.serverUrl.startsWith('ws:')
        ? 'Yerel oda: bu davet aynı bilgisayardaki profillerde çalışır. Farklı cihazlar için ortak bir WSS sunucusu kullan.'
        : '';
      localHint.hidden = !localHint.textContent;
      const track = room.playback.track;
      const local = adapter.getTrackMetadata();
      title.textContent = track?.title ?? track?.videoId ?? 'Henüz bir şarkı yok';
      artist.textContent = track?.artist ?? '';
      playback.textContent = room.playback.playing ? 'Çalıyor' : 'Duraklatıldı';
      if (local.videoId === track?.videoId && local.artworkUrl) {
        if (artwork.getAttribute('src') !== local.artworkUrl) artwork.src = local.artworkUrl;
        artwork.hidden = false;
      } else artwork.hidden = true;
      sync.textContent = state.host
        ? 'Oynatma kontrolü sende.'
        : `Oynatma kontrolü oda sahibinde.${connection.rttMs !== null ? ` Bağlantı: ${Math.round(connection.rttMs)} ms.` : ''}`;
      toggle.hidden = next.hidden = !state.host;
      toggle.textContent = room.playback.playing ? 'Duraklat' : 'Oynat';
      toggle.disabled = !connected || state.changingTrack || !track;
      next.disabled = !connected || state.changingTrack || !room.queue.length;
      syncButton.disabled = !connected || !track;
      retry.hidden = connected;
      add.disabled = addCurrent.disabled = !connected;
      leave.textContent = state.host ? 'Odayı bitir' : 'Odadan ayrıl';
      const memberText = JSON.stringify(room.members);
      if (membersSignature !== memberText) {
        membersSignature = memberText;
        members.replaceChildren();
        for (const member of room.members) {
          const item = element('li');
          item.append(
            element(
              'span',
              `${member.displayName}${member.clientId === connection.clientId ? ' (sen)' : ''}`,
            ),
            element(
              'small',
              `${member.clientId === room.hostClientId ? 'Oda sahibi' : 'Dinleyici'}${member.connected ? '' : ' · Bağlantı kesildi'}`,
            ),
          );
          members.append(item);
        }
      }
      const signature = JSON.stringify(room.queue) + state.host + connected;
      if (signature !== queueSignature) {
        queueSignature = signature;
        const focused = shadow.activeElement?.getAttribute('data-focus-key');
        queue.replaceChildren();
        for (const [index, entry] of room.queue.entries()) {
          const row = element('li');
          const info = element('div', '', 'queue-info');
          info.append(
            element('p', entry.track.title ?? entry.track.videoId, 'title'),
            element(
              'small',
              `${entry.track.artist ? entry.track.artist + ' · ' : ''}${room.members.find(({ clientId }) => clientId === entry.addedByClientId)?.displayName ?? 'Ayrılan dinleyici'} ekledi`,
            ),
          );
          row.append(info);
          if (state.host) {
            const controls = element('div', '', 'queue-actions');
            for (const direction of ['up', 'down'] as const) {
              const move = button(direction === 'up' ? '↑' : '↓', () =>
                controller.command({ type: 'queue.move', entryId: entry.id, direction }),
              );
              move.setAttribute(
                'aria-label',
                `${entry.track.title ?? entry.track.videoId}: ${direction === 'up' ? 'yukarı taşı' : 'aşağı taşı'}`,
              );
              move.dataset.focusKey = `${entry.id}:${direction}`;
              move.disabled =
                !connected || (direction === 'up' ? index === 0 : index === room.queue.length - 1);
              controls.append(move);
            }
            const remove = button('Kaldır', () =>
              controller.command({ type: 'queue.remove', entryId: entry.id }),
            );
            remove.disabled = !connected;
            remove.dataset.focusKey = `${entry.id}:remove`;
            controls.append(remove);
            row.append(controls);
          }
          queue.append(row);
        }
        if (focused)
          [...queue.querySelectorAll<HTMLButtonElement>('button')]
            .find((node) => node.dataset.focusKey === focused)
            ?.focus();
      }
      empty.hidden = !!room.queue.length;
      queueTitle.textContent = `Ortak sıra (${room.queue.length})`;
    };
    try {
      render();
      dialog.showModal();
    } catch (error) {
      close(false);
      console.error('[Better YTM] Listen Together screen unavailable:', error);
    }
  }
  function onHashChange() {
    if (parseRoomInvite(document.location.href)) open();
  }
  return {
    open,
    start() {
      if (started) return;
      started = true;
      closedByUser = false;
      unsubscribe = controller.subscribe(() => {
        if (
          !dialog &&
          !closedByUser &&
          controller.getState().connection.panelOpen &&
          controller.getState().connection.snapshot
        )
          open();
        render?.();
      });
      view?.addEventListener('hashchange', onHashChange);
      if (initialInvite) open();
    },
    dispose() {
      started = false;
      unsubscribe?.();
      unsubscribe = undefined;
      view?.removeEventListener('hashchange', onHashChange);
      close(false);
    },
  };
}
