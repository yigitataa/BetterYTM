/** Semantic paint targets. Host selectors stay entirely inside the YTM adapter. */
export type VisualTarget =
  | 'canvas'
  | 'ambientCanvas'
  | 'navigationBackground'
  | 'navigationDivider'
  | 'sidebar'
  | 'sidebarContent'
  | 'sidebarEntry'
  | 'sidebarSelected'
  | 'miniSidebarBackground'
  | 'navigation'
  | 'search'
  | 'searchInput'
  | 'suggestions'
  | 'suggestion'
  | 'content'
  | 'browseBackground'
  | 'card'
  | 'cardArtwork'
  | 'cardDetails'
  | 'row'
  | 'rowSelected'
  | 'rowDetails'
  | 'rowSecondary'
  | 'player'
  | 'playerPage'
  | 'queue'
  | 'playerArtwork'
  | 'playerControl'
  | 'playerIcon'
  | 'progress'
  | 'volume'
  | 'keyboardFocus';

export type PaintProperty =
  | 'background-color'
  | 'background-image'
  | 'background-attachment'
  | 'background-repeat'
  | 'color'
  | 'border-color'
  | 'border-radius'
  | 'box-shadow'
  | 'text-shadow'
  | 'outline-color'
  | 'outline-style'
  | 'outline-width'
  | 'outline-offset'
  | 'fill'
  | 'stroke'
  | 'accent-color';

export type PaintDeclarations = Readonly<Partial<Record<PaintProperty, string>>>;
export type GlassTarget = 'navigation' | 'sidebarContent' | 'player';

export interface VisualRule {
  readonly target: VisualTarget;
  readonly state?: 'hover' | 'active' | 'focus-within' | 'selection';
  readonly declarations: PaintDeclarations;
  /** Only proven native surface fill conflicts; never a geometry declaration. */
  readonly important?: readonly PaintProperty[];
}

export interface LayoutBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export type LayoutRegion =
  | 'sidebar'
  | 'navigation'
  | 'search'
  | 'content'
  | 'card'
  | 'row'
  | 'player'
  | 'artwork'
  | 'controls';

export interface LayoutSample {
  /** Adapter-local identity; no DOM reference, selector, text or resource URL. */
  readonly identity: number;
  readonly box: LayoutBox;
  readonly scroll: {
    readonly clientWidth: number;
    readonly clientHeight: number;
    readonly scrollWidth: number;
    readonly scrollHeight: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  };
  readonly typography: {
    readonly fontFamily: string;
    readonly fontSize: string;
    readonly lineHeight: string;
    readonly letterSpacing: string;
  };
  readonly textRects: readonly LayoutBox[];
  readonly textFingerprint: number;
}

export interface LayoutSnapshot {
  readonly capturedAt: number;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly pixelRatio: number;
    readonly scrollX: number;
    readonly scrollY: number;
  };
  readonly regions: Readonly<Record<LayoutRegion, LayoutSample | null>>;
}

export interface GlassBindingHealth {
  readonly enabled: boolean;
  readonly eligible: readonly GlassTarget[];
  readonly skipped: Readonly<Partial<Record<GlassTarget, string>>>;
}
