/** All host selectors, including fallback order, live in this module only. */
import type { GlassTarget, LayoutRegion, VisualTarget } from '@better-ytm/shared';

// Home/miniplayer mappings verified in the user's 2026-10-05 UI-only report.
// Main playlist row mappings await a report; queue rows are not their fallback.
export const VISUAL_SELECTORS: Readonly<Record<VisualTarget, readonly string[]>> = {
  canvas: ['html', 'body', 'ytmusic-app'],
  ambientCanvas: ['ytmusic-app'],
  navigationBackground: ['ytmusic-app-layout #nav-bar-background'],
  navigationDivider: ['ytmusic-app-layout #nav-bar-divider'],
  sidebar: ['tp-yt-app-drawer#guide'],
  sidebarContent: ['#guide-content'],
  sidebarEntry: ['ytmusic-guide-entry-renderer tp-yt-paper-item'],
  sidebarSelected: [
    'ytmusic-guide-entry-renderer[active] tp-yt-paper-item',
    'ytmusic-guide-entry-renderer tp-yt-paper-item[aria-current="true"]',
  ],
  miniSidebarBackground: ['ytmusic-app-layout #mini-guide-background'],
  navigation: ['ytmusic-nav-bar'],
  search: ['ytmusic-search-box .search-container'],
  searchInput: ['ytmusic-search-box input#input'],
  suggestions: ['ytmusic-search-suggestions-section'],
  suggestion: ['ytmusic-search-suggestion'],
  content: ['ytmusic-app-layout #content[role="main"]'],
  // Both direct children are present in the captured native browse template.
  // Clearing only the gradient leaves a finite-height immersive image/color slab.
  browseBackground: [
    'ytmusic-browse-response > .background-gradient',
    'ytmusic-browse-response > #background.immersive-background',
  ],
  card: ['ytmusic-two-row-item-renderer'],
  cardArtwork: ['ytmusic-two-row-item-renderer a.image-wrapper'],
  cardDetails: ['ytmusic-two-row-item-renderer .details'],
  row: ['ytmusic-player-queue-item'],
  rowSelected: ['ytmusic-player-queue-item[selected]'],
  rowDetails: ['ytmusic-player-queue-item .song-info'],
  rowSecondary: ['ytmusic-player-queue-item .duration'],
  player: ['ytmusic-miniplayer'],
  playerPage: ['ytmusic-player-page'],
  queue: ['ytmusic-player-queue'],
  playerArtwork: ['ytmusic-miniplayer img.ytmusicTrackInfoThumbnail'],
  playerControl: ['ytmusic-miniplayer button'],
  playerIcon: ['ytmusic-miniplayer button svg'],
  progress: ['ytmusic-miniplayer input.ytMusicMiniPlayerProgressBar'],
  volume: ['ytmusic-miniplayer input#slider.ytSliderShapeVerticalSlider'],
  keyboardFocus: ['ytmusic-app :focus-visible'],
};

export const GLASS_ATTRIBUTE = 'data-bytm-glass';
export const GLASS_VALUE = 'phase-3';
export const GLASS_TARGETS: readonly GlassTarget[] = ['navigation', 'sidebarContent', 'player'];
// One state attribute beats native class paint rules without an ID/specificity stack.
export const SKIN_SCOPE = ':where(html)[data-bytm-enabled="true"]';
export const HOST_COLOR_SCOPE = ':where(ytmusic-app)';

// Only color variables actually present in the user's computed-style report.
// Never map density, spacing, font or size variables into host CSS.
export const HOST_COLOR_VARIABLES: Readonly<Record<string, string>> = {
  '--ytmusic-background': '--bytm-background-base',
  '--ytmusic-color-black4': '--bytm-background-base',
  '--ytmusic-color-black1': '--bytm-surface-solid',
  '--ytmusic-brand-background-solid': '--bytm-surface-solid',
  '--ytmusic-menu-item-hover-background-color': '--bytm-glass-fill',
  '--ytmusic-menu-item-focus-background-color': '--bytm-glass-fill-strong',
  '--ytmusic-dropdown-item-hover-background': '--bytm-glass-fill-strong',
  '--ytmusic-dropdown-border-color': '--bytm-glass-stroke',
  '--ytmusic-search-border': '--bytm-glass-stroke',
  '--ytmusic-guide-entry-focus-border': '--bytm-accent',
  '--ytmusic-search-bar-background-bauhaus': '--bytm-glass-fill',
  '--paper-input-container-input-color': '--bytm-text-primary',
  '--paper-menu-color': '--bytm-text-primary',
  '--ytmusic-player-bar-ink-color': '--bytm-text-secondary',
  '--ytmusic-icon-disabled': '--bytm-text-muted',
  '--ytmusic-search-suggestion-icon-color': '--bytm-text-secondary',
  '--ytmusic-color-white1-alpha70': '--bytm-text-secondary',
  '--ytmusic-color-white-opacity-0-5': '--bytm-text-secondary',
};

export const LAYOUT_SELECTORS: Readonly<Record<LayoutRegion, readonly string[]>> = {
  sidebar: ['#guide-content', 'ytmusic-guide-renderer#guide-renderer'],
  navigation: VISUAL_SELECTORS.navigation,
  search: VISUAL_SELECTORS.search,
  content: VISUAL_SELECTORS.content,
  card: VISUAL_SELECTORS.card,
  row: [],
  player: VISUAL_SELECTORS.player,
  artwork: VISUAL_SELECTORS.playerArtwork,
  controls: ['ytmusic-miniplayer ytmusic-wiz-player-controls'],
};

export function visualNodes(scope: ParentNode, selectors: readonly string[]): Element[] {
  return selectors.length ? [...scope.querySelectorAll(selectors.join(', '))] : [];
}

export function containsGlassTarget(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const element = node as Element;
  const selector = GLASS_TARGETS.flatMap((target) => VISUAL_SELECTORS[target]).join(', ');
  return element.matches(selector) || element.querySelector(selector) !== null;
}

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
  'srcset',
  'sizes',
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
