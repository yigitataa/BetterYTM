import { NAVIGATION_SELECTORS as host } from './selectors.js';
import { COMPACT_NAVIGATION_CSS } from './navigation-styles.js';

const destinations = [
  {
    id: 'home',
    path: '/',
    labels: ['ana sayfa', 'home'],
    icon: 'M12 3 2 11h3v10h6v-6h2v6h6V11h3L12 3Z',
  },
  {
    id: 'explore',
    path: '/explore',
    labels: ['kesfet', 'explore'],
    icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm5 3-7 3-3 7 7-3 3-7Zm-5 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
  },
  {
    id: 'library',
    path: '/library',
    labels: ['kitaplik', 'library'],
    icon: 'M6 2h12a2 2 0 0 1 2 2v18l-8-5-8 5V4a2 2 0 0 1 2-2Zm0 2v14.4l6-3.8 6 3.8V4H6Z',
  },
] as const;
type Destination = (typeof destinations)[number];

/** Locale labels come from the native guide, not from private page properties. */
export function navigationDestination(label: string): Destination | undefined {
  const normalized = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
  return destinations.find(({ labels }) => (labels as readonly string[]).includes(normalized));
}

export function bindCompactNavigation(document: Document) {
  const view = document.defaultView;
  if (!view) throw new Error('Navigation needs the host window.');
  const root = document.documentElement;
  const previous = root.getAttribute('data-bytm-navigation');
  const sheet = document.createElement('style');
  sheet.id = 'better-ytm-navigation';
  sheet.textContent = COMPACT_NAVIGATION_CSS;
  const toolbar = document.createElement('nav');
  toolbar.id = 'better-ytm-navigation-shortcuts';
  toolbar.setAttribute('aria-label', 'YouTube Music');
  const links = new Map<string, HTMLAnchorElement>();
  let sources = new Map<string, HTMLElement>();
  let app: Element | null = null;
  let guide: Element | null = null;
  let drawer: Element | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startupDone = false;
  let closedOnStartup = false;
  let userInteracted = false;

  function nativeEntries() {
    const entries = new Map<string, HTMLElement>();
    for (const entry of document.querySelectorAll<HTMLElement>(host.primary)) {
      const label = entry.querySelector(host.title)?.textContent ?? '';
      const destination = navigationDestination(label);
      if (destination && !entries.has(destination.id)) entries.set(destination.id, entry);
    }
    return entries;
  }

  for (const destination of destinations) {
    const link = document.createElement('a');
    link.href = destination.path;
    link.dataset.bytmDestination = destination.id;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', destination.icon);
    icon.append(path);
    link.append(icon);
    link.addEventListener('click', (event) => {
      // Keep standard link behavior for new tabs and for an unavailable native guide.
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const entry = nativeEntries().get(destination.id);
      if (!entry?.isConnected) return;
      event.preventDefault();
      (entry.querySelector<HTMLElement>(host.item) ?? entry).click();
    });
    links.set(destination.id, link);
    toolbar.append(link);
  }

  const scoped = new view.MutationObserver((records) => {
    if (
      records.some(({ target }) => target === app || target === drawer || guide?.contains(target))
    )
      schedule();
  });

  function refresh() {
    if (stopped) return;
    sources = nativeEntries();
    const search = document.querySelector(host.search);
    app = document.querySelector(host.app);
    guide = document.querySelector(host.guide);
    drawer = document.querySelector(host.drawer);
    scoped.disconnect();
    if (app)
      scoped.observe(app, {
        attributes: true,
        attributeFilter: ['guide-collapsed', 'is-guide-persistent'],
      });
    if (drawer) scoped.observe(drawer, { attributes: true, attributeFilter: ['opened'] });
    if (guide)
      scoped.observe(guide, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['is-primary', 'active', 'aria-current'],
      });
    if (sources.size !== destinations.length || !search?.parentElement || !app || !drawer) {
      toolbar.remove();
      if (root.getAttribute('data-bytm-navigation') === 'compact')
        root.removeAttribute('data-bytm-navigation');
      return;
    }
    for (const destination of destinations) {
      const entry = sources.get(destination.id)!;
      const link = links.get(destination.id)!;
      const label = entry.querySelector(host.title)!.textContent!.replace(/\s+/g, ' ').trim();
      if (link.title !== label) {
        link.title = label;
        link.setAttribute('aria-label', label);
      }
      const selected =
        entry.hasAttribute('active') ||
        entry.querySelector(host.item)?.getAttribute('aria-current') === 'true';
      if (selected && !link.hasAttribute('aria-current')) link.setAttribute('aria-current', 'page');
      if (!selected && link.hasAttribute('aria-current')) link.removeAttribute('aria-current');
    }
    if (toolbar.previousElementSibling !== search) search.after(toolbar);
    if (root.getAttribute('data-bytm-navigation') !== 'compact')
      root.setAttribute('data-bytm-navigation', 'compact');
    if (!startupDone) {
      if (app.hasAttribute('guide-collapsed')) startupDone = true;
      else if (drawer.hasAttribute('opened')) {
        const toggle = document.querySelector<HTMLElement>(host.toggle);
        if (toggle) {
          startupDone = true;
          closedOnStartup = true;
          toggle.click();
        }
      }
    }
  }

  function schedule() {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      try {
        refresh();
      } catch {
        dispose();
        console.warn('[Better YTM] Compact navigation stopped; native navigation restored.');
      }
    }, 60);
  }

  const discovery = new view.MutationObserver((records) => {
    const selector = [host.app, host.bar, host.search, host.guide, host.drawer, host.primary].join(
      ', ',
    );
    if (
      (guide && !guide.isConnected) ||
      (app && !app.isConnected) ||
      (sources.size && !toolbar.isConnected)
    )
      return schedule();
    for (const record of records) {
      if (toolbar.contains(record.target)) continue;
      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        if (
          node instanceof view.Element &&
          (node.matches(selector) || node.querySelector(selector))
        )
          return schedule();
      }
    }
  });

  const onClick = (event: MouseEvent) => {
    if (!event.isTrusted || !(event.target instanceof view.Element)) return;
    if (
      event.target.closest(host.toggle) ||
      toolbar.contains(event.target) ||
      drawer?.contains(event.target)
    ) {
      userInteracted = true;
      startupDone = true;
    }
  };

  function dispose() {
    if (stopped) return;
    stopped = true;
    discovery.disconnect();
    scoped.disconnect();
    if (timer !== undefined) clearTimeout(timer);
    document.removeEventListener('click', onClick, true);
    toolbar.remove();
    sheet.remove();
    if (root.getAttribute('data-bytm-navigation') === 'compact') {
      if (previous === null) root.removeAttribute('data-bytm-navigation');
      else root.setAttribute('data-bytm-navigation', previous);
    }
    if (
      closedOnStartup &&
      !userInteracted &&
      app?.isConnected &&
      app.hasAttribute('guide-collapsed')
    )
      document.querySelector<HTMLElement>(host.toggle)?.click();
    sources.clear();
  }
  try {
    document.head.append(sheet);
    document.addEventListener('click', onClick, true);
    discovery.observe(root, { childList: true, subtree: true });
    refresh();
  } catch (error) {
    dispose();
    throw error;
  }
  return { dispose };
}
