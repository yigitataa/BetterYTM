/** All host selectors, including fallback order, live in this module only. */
type SelectorRole =
  | 'mediaRoot'
  | 'playerRoot'
  | 'media'
  | 'title'
  | 'artist'
  | 'artwork'
  | 'trackLink'
  | 'seekControl'
  | 'next'
  | 'previous';

interface SelectorProfile {
  readonly id: string;
  readonly selectors: Readonly<Record<SelectorRole, readonly string[]>>;
}

// Verified by the user's live DOM reports on 2026-10-05.
// Turkish control labels are intentional: other locales need verified mappings.
export const SELECTOR_PROFILE: SelectorProfile = {
  id: 'ytm-user-dom-2026-10-05-v1',
  selectors: {
    mediaRoot: ['#movie_player'],
    playerRoot: ['ytmusic-miniplayer'],
    media: ['video'],
    title: ['a.ytp-title-link'],
    artist: ['a.ytAttributedStringLink[role="button"]', 'a.ytAttributedStringLink'],
    artwork: ['img.ytmusicTrackInfoThumbnail'],
    trackLink: ['a.ytp-title-link[href]'],
    seekControl: ['input.ytMusicMiniPlayerProgressBar'],
    next: ['button[aria-label="Sonraki"]', 'button[title="Sonraki"]'],
    previous: ['button[aria-label="Önceki"]', 'button[title="Önceki"]'],
  },
};

export const UI_OBSERVED_ATTRIBUTES = [
  'id',
  'class',
  'disabled',
  'readonly',
  'aria-disabled',
  'aria-readonly',
  'hidden',
  'inert',
  'href',
  'src',
  'title',
  'aria-label',
];

// The media root includes the verified title/watch anchor. Media src is excluded.
export const MEDIA_ROOT_OBSERVED_ATTRIBUTES = ['id', 'class', 'href', 'title'];

export interface Resolution {
  readonly element: Element | null;
  readonly problem: 'unmapped' | 'missing' | 'ambiguous' | 'invalid-selector' | null;
}

export function resolveElement(scope: ParentNode | null, role: SelectorRole): Resolution {
  const selectors = SELECTOR_PROFILE.selectors[role];
  if (!selectors.length) return { element: null, problem: 'unmapped' };
  if (!scope) return { element: null, problem: 'missing' };
  for (const selector of selectors) {
    let matches: NodeListOf<Element>;
    try {
      matches = scope.querySelectorAll(selector);
    } catch {
      return { element: null, problem: 'invalid-selector' };
    }
    // Never choose the first of multiple potential players/controls.
    if (matches.length > 1) return { element: null, problem: 'ambiguous' };
    const element = matches.item(0);
    if (element) return { element, problem: null };
  }
  return { element: null, problem: 'missing' };
}

export function profileIsMapped(): boolean {
  return (
    SELECTOR_PROFILE.selectors.mediaRoot.length > 0 ||
    SELECTOR_PROFILE.selectors.playerRoot.length > 0
  );
}

/** Used only on newly added subtrees by the cheap structural discovery observer. */
export function containsPlayerRoot(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const element = node as Element;
  return [...SELECTOR_PROFILE.selectors.mediaRoot, ...SELECTOR_PROFILE.selectors.playerRoot].some(
    (selector) => {
      try {
        return element.matches(selector) || element.querySelector(selector) !== null;
      } catch {
        return false; // resolveElement reports the invalid selector during the next probe.
      }
    },
  );
}

export function isUsableControl(element: Element | null): element is HTMLElement {
  if (
    !element ||
    !element.isConnected ||
    !('click' in element) ||
    typeof element.click !== 'function'
  )
    return false;
  // Native disabled and accessibility state on the host control or its wrappers.
  for (let current: Element | null = element; current; current = current.parentElement) {
    if (
      current.hasAttribute('disabled') ||
      current.hasAttribute('readonly') ||
      current.hasAttribute('inert') ||
      current.hasAttribute('hidden') ||
      current.getAttribute('aria-disabled') === 'true' ||
      current.getAttribute('aria-readonly') === 'true'
    )
      return false;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style?.visibility !== 'hidden' &&
    style?.visibility !== 'collapse' &&
    style?.pointerEvents !== 'none'
  );
}
