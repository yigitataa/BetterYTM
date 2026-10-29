import type { YTMAdapter } from '@better-ytm/ytm-adapter';
import { LISTEN_TOGETHER_CSS } from './styles.js';

/** Lazy, isolated feature surface. No transport or host selectors in the UI. */
export function createListenTogetherPage(document: Document, adapter: YTMAdapter) {
  let host: HTMLDivElement | undefined;
  let dialog: HTMLDialogElement | undefined;
  let unsubscribe: (() => void) | undefined;
  let returnFocus: Element | null = null;
  let title: HTMLParagraphElement;
  let artist: HTMLParagraphElement;
  let artwork: HTMLImageElement;
  let readiness: HTMLParagraphElement;

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

  function update() {
    const metadata = adapter.getTrackMetadata();
    const { capabilities } = adapter.getHealth();
    title.textContent = metadata.title ?? 'Henüz bir parça seçilmedi';
    artist.textContent = metadata.artist ?? 'YouTube Music’ten bir şarkı açabilirsin.';
    const artworkUrl = metadata.artworkUrl;
    artwork.hidden = !artworkUrl;
    if (artworkUrl && artwork.getAttribute('src') !== artworkUrl) artwork.src = artworkUrl;
    if (!artworkUrl) artwork.removeAttribute('src');
    const ready =
      capabilities.trackIdentity &&
      capabilities.playPause &&
      capabilities.seeking &&
      capabilities.openTrack;
    readiness.textContent = ready
      ? 'Oynatıcı hazır. Parça, oynat/duraklat ve sarma kontrolleri kullanılabilir.'
      : 'Oynatıcı bekleniyor. Hazırlığı kontrol etmek için bir şarkı başlat.';
  }

  function close() {
    unsubscribe?.();
    unsubscribe = undefined;
    dialog?.close();
    host?.remove();
    dialog = undefined;
    host = undefined;
    const view = document.defaultView;
    if (view && returnFocus instanceof view.HTMLElement && returnFocus.isConnected)
      returnFocus.focus();
    returnFocus = null;
  }

  function open() {
    if (dialog?.open) return;
    returnFocus = document.activeElement;
    host = element('div');
    host.id = 'better-ytm-listen-together';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = element('style', LISTEN_TOGETHER_CSS);
    dialog = element('dialog');
    dialog.lang = 'tr';
    dialog.setAttribute('aria-labelledby', 'together-heading');
    const header = element('header');
    const closeButton = element('button', '×', 'close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Birlikte Dinle ekranını kapat');
    closeButton.addEventListener('click', close);
    header.append(element('p', 'Birlikte Dinle', 'brand'), closeButton);
    const main = element('main');
    const intro = element('div', undefined, 'intro');
    const heading = element('h1', 'Aynı şarkıda buluşalım.');
    heading.id = 'together-heading';
    intro.append(
      element('p', 'Better YTM · Jam', 'label'),
      heading,
      element(
        'p',
        'Arkadaşlarınla ortak bir sıra oluştur, aynı anda dinle. Herkes kendi YouTube Music hesabından katılır.',
        'lead',
      ),
    );
    const workspace = element('div', undefined, 'workspace');
    const plan = element('section');
    plan.append(element('h2', 'İlk sürüm için planımız'));
    const definitions = element('dl');
    for (const [term, description] of [
      ['Bir oda, bir davet', 'Oda oluştur; arkadaşların bir kod veya bağlantıyla katılsın.'],
      [
        'Sırayı birlikte oluşturun',
        'Herkes şarkı eklesin. Sırada ne olduğunu ve kimin eklediğini birlikte görün.',
      ],
      [
        'Kontrol oda sahibinde',
        'Oynat, duraklat, parçayı değiştir. Diğer dinleyiciler seni takip etsin.',
      ],
      ['Herkes kendi cihazında', 'Parça ve çalma konumu eşleşsin; ses seviyesi sana kalsın.'],
    ]) {
      const row = element('div');
      row.append(element('dt', term), element('dd', description));
      definitions.append(row);
    }
    plan.append(definitions);
    const player = element('section', undefined, 'player');
    player.append(element('h2', 'Şu an sende çalan'));
    const track = element('div', undefined, 'track');
    artwork = element('img');
    artwork.alt = '';
    artwork.referrerPolicy = 'no-referrer';
    const image = artwork;
    image.addEventListener('error', () => {
      image.hidden = true;
    });
    title = element('p', undefined, 'title');
    artist = element('p', undefined, 'artist');
    const metadata = element('div', undefined, 'metadata');
    metadata.append(title, artist);
    track.append(artwork, metadata);
    readiness = element('p', undefined, 'readiness');
    player.append(
      track,
      readiness,
      element(
        'p',
        'Oda bağlantısı henüz etkin değil. Bu ekranı birlikte geliştirmeye başlıyoruz.',
        'note',
      ),
    );
    workspace.append(plan, player);
    main.append(intro, workspace);
    dialog.append(
      header,
      main,
      element(
        'footer',
        'Bu aşamada parça bilgilerin yalnızca bu ekranda gösterilir. Bir sunucuya gönderilmez.',
      ),
    );
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    const screen = dialog;
    dialog.addEventListener('close', () => {
      if (dialog === screen) close();
    });
    shadow.append(style, dialog);
    document.body.append(host);
    try {
      update();
      // Only subscribe while visible; position ticks do not rebuild the screen.
      unsubscribe = adapter.subscribe((event) => {
        if (['snapshot', 'trackchange', 'metadatachange', 'healthchange'].includes(event.type))
          update();
      });
      dialog.showModal();
    } catch (error) {
      close();
      console.error('[Better YTM] Listen Together screen unavailable:', error);
    }
  }

  return { open, dispose: close };
}
