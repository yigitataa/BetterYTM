import {
  containsPlayerRoot,
  MEDIA_ROOT_OBSERVED_ATTRIBUTES,
  UI_OBSERVED_ATTRIBUTES,
} from './selectors.js';

const MEDIA_EVENTS = [
  'play',
  'pause',
  'playing',
  'timeupdate',
  'seeking',
  'seeked',
  'durationchange',
  'volumechange',
  'loadedmetadata',
  'emptied',
  'ended',
  'waiting',
  'canplay',
  'error',
] as const;

/** One bounded timer, one structural observer, scoped UI/media observers and listeners. */
export function observePlayer(document: Document, refresh: (causes: ReadonlySet<string>) => void) {
  const Observer = document.defaultView?.MutationObserver;
  if (!Observer) throw new Error('MutationObserver is unavailable in this document.');
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let media: HTMLMediaElement | null = null;
  let mediaRoot: Element | null = null;
  let playerRoot: Element | null = null;
  let scoped: MutationObserver[] = [];
  const causes = new Set<string>();

  function schedule(cause: string) {
    if (stopped) return;
    causes.add(cause);
    // Throttle, not trailing debounce: continuous SPA/media updates cannot starve it.
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      const batch = new Set(causes);
      causes.clear();
      if (!stopped) refresh(batch);
    }, 100);
  }

  const structural = new Observer((records) => {
    if (
      (!mediaRoot && !playerRoot) ||
      (mediaRoot && !mediaRoot.isConnected) ||
      (playerRoot && !playerRoot.isConnected)
    ) {
      schedule('dom');
      return;
    }
    // Ignore unrelated mutations inside existing roots: their scoped observers handle them.
    for (const record of records) {
      if (mediaRoot?.contains(record.target) || playerRoot?.contains(record.target)) continue;
      for (const node of record.addedNodes) {
        if (containsPlayerRoot(node)) {
          schedule('dom');
          return;
        }
      }
    }
  });
  structural.observe(document.documentElement, { childList: true, subtree: true });

  const onMediaEvent = (event: Event) => schedule(event.type);
  return {
    bind(
      nextMediaRoot: Element | null,
      nextPlayerRoot: Element | null,
      nextMedia: HTMLMediaElement | null,
    ) {
      if (stopped) return;
      if (nextMediaRoot !== mediaRoot || nextPlayerRoot !== playerRoot) {
        playerRoot?.removeEventListener('load', onMediaEvent, true);
        for (const observer of scoped) observer.disconnect();
        scoped = [];
        mediaRoot = nextMediaRoot;
        playerRoot = nextPlayerRoot;
        if (mediaRoot) {
          const observer = new Observer(() => schedule('dom'));
          observer.observe(mediaRoot, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: MEDIA_ROOT_OBSERVED_ATTRIBUTES,
          });
          scoped.push(observer);
        }
        if (playerRoot) {
          playerRoot.addEventListener('load', onMediaEvent, true);
          const observer = new Observer(() => schedule('dom'));
          observer.observe(playerRoot, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: UI_OBSERVED_ATTRIBUTES,
          });
          scoped.push(observer);
        }
      }
      if (nextMedia !== media) {
        if (media) for (const name of MEDIA_EVENTS) media.removeEventListener(name, onMediaEvent);
        media = nextMedia;
        if (media) for (const name of MEDIA_EVENTS) media.addEventListener(name, onMediaEvent);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      structural.disconnect();
      for (const observer of scoped) observer.disconnect();
      if (media) for (const name of MEDIA_EVENTS) media.removeEventListener(name, onMediaEvent);
      playerRoot?.removeEventListener('load', onMediaEvent, true);
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      causes.clear();
      scoped = [];
      media = mediaRoot = playerRoot = null;
    },
  };
}
