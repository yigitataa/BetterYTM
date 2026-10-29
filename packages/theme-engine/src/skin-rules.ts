import type { VisualRule } from '@better-ytm/shared';

// The full-screen player uses the same viewport-anchored field as the app canvas.
const ambientBackground = {
  'background-image':
    'radial-gradient(ellipse at 8% 4%, rgba(var(--bytm-accent-rgb), calc(0.34 * var(--bytm-ambience-intensity))) 0%, transparent 76%), radial-gradient(ellipse at 100% 58%, rgba(var(--bytm-ambient-rgb), calc(0.34 * var(--bytm-ambience-intensity))) 0%, transparent 78%)',
  'background-attachment': 'fixed',
  'background-repeat': 'no-repeat',
} as const;

const surface = {
  'background-color': 'var(--bytm-background-layer1)',
  'background-image':
    'linear-gradient(125deg, var(--bytm-glass-fill-strong), transparent 38%, rgba(var(--bytm-accent-rgb), 0.06) 76%, var(--bytm-glass-fill))',
  'box-shadow':
    'inset 0 1px 0 var(--bytm-glass-stroke), inset 1px 0 0 var(--bytm-glass-fill), inset 0 -1px 0 rgba(0, 0, 0, 0.12)',
  color: 'var(--bytm-text-primary)',
} as const;
const quietHover = {
  'background-color': 'var(--bytm-glass-fill-strong)',
  'box-shadow': 'inset 0 0 0 1px var(--bytm-glass-stroke)',
} as const;

/** Paint only. No density/spacing/font metrics, host filters or motion overrides.
 * Important is limited to native opaque fills/overlays and visible keyboard focus.
 * Hairlines use inset shadows; even border-style/width must remain native.
 */
export const VISUAL_SKIN_RULES: readonly VisualRule[] = [
  {
    target: 'canvas',
    declarations: {
      'background-color': 'var(--bytm-background-base)',
      'background-image': 'none',
      color: 'var(--bytm-text-primary)',
    },
    important: ['background-color', 'background-image'],
  },
  {
    target: 'ambientCanvas',
    declarations: ambientBackground,
    important: ['background-image', 'background-attachment', 'background-repeat'],
  },
  {
    target: 'navigationBackground',
    declarations: { 'background-color': 'transparent' },
    important: ['background-color'],
  },
  {
    target: 'navigationDivider',
    declarations: { 'background-color': 'transparent' },
    important: ['background-color'],
  },
  {
    target: 'sidebar',
    declarations: { 'background-color': 'transparent' },
    important: ['background-color'],
  },
  { target: 'sidebarContent', declarations: surface, important: ['background-color'] },
  {
    target: 'miniSidebarBackground',
    declarations: { 'background-color': 'var(--bytm-background-layer1)' },
    important: ['background-color'],
  },
  { target: 'sidebarEntry', declarations: { color: 'var(--bytm-text-secondary)' } },
  { target: 'sidebarEntry', state: 'hover', declarations: quietHover },
  {
    target: 'sidebarEntry',
    state: 'active',
    declarations: { 'background-color': 'var(--bytm-glass-fill-strong)' },
  },
  {
    target: 'sidebarSelected',
    declarations: {
      'background-color': 'rgba(var(--bytm-accent-rgb), 0.2)',
      color: 'var(--bytm-accent)',
      'box-shadow': 'inset 0 1px 0 var(--bytm-glass-stroke)',
    },
  },
  { target: 'navigation', declarations: surface, important: ['background-color'] },
  {
    target: 'search',
    declarations: {
      ...surface,
      'background-color': 'var(--bytm-glass-fill)',
      'border-color': 'var(--bytm-glass-stroke)',
      'box-shadow': 'inset 0 1px 0 var(--bytm-glass-stroke)',
      'border-radius': 'var(--bytm-radius-5)',
    },
  },
  {
    target: 'search',
    state: 'focus-within',
    declarations: {
      'border-color': 'var(--bytm-accent)',
      'box-shadow': 'inset 0 0 0 1px var(--bytm-accent)',
    },
  },
  { target: 'searchInput', declarations: { color: 'var(--bytm-text-primary)' } },
  {
    target: 'suggestions',
    declarations: {
      'background-color': 'var(--bytm-surface-solid)',
      color: 'var(--bytm-text-primary)',
      'box-shadow': 'inset 0 1px 0 var(--bytm-glass-stroke), 0 12px 28px rgba(0, 0, 0, 0.28)',
    },
    important: ['background-color'],
  },
  {
    target: 'suggestion',
    declarations: { 'background-color': 'transparent' },
    important: ['background-color'],
  },
  {
    target: 'suggestion',
    state: 'hover',
    declarations: { 'background-color': 'var(--bytm-glass-fill-strong)' },
    important: ['background-color'],
  },
  {
    target: 'content',
    declarations: {
      color: 'var(--bytm-text-primary)',
      'background-color': 'transparent',
      'background-image': 'none',
    },
    important: ['background-color', 'background-image'],
  },
  {
    target: 'browseBackground',
    declarations: {
      'background-color': 'transparent',
      'background-image': 'none',
      'box-shadow': 'none',
    },
    important: ['background-color', 'background-image', 'box-shadow'],
  },
  {
    target: 'browseArtworkBackground',
    declarations: { opacity: '0' },
    important: ['opacity'],
  },
  {
    target: 'card',
    declarations: {
      'background-color': 'transparent',
      color: 'var(--bytm-text-primary)',
      'border-radius': 'var(--bytm-radius-2)',
    },
  },
  { target: 'card', state: 'hover', declarations: quietHover },
  {
    target: 'cardArtwork',
    declarations: {
      'border-radius': 'var(--bytm-radius-2)',
      'box-shadow': '0 6px 18px rgba(0, 0, 0, 0.18)',
    },
  },
  { target: 'cardDetails', declarations: { color: 'var(--bytm-text-primary)' } },
  {
    target: 'row',
    declarations: { 'border-color': 'var(--bytm-glass-stroke)', color: 'var(--bytm-text-primary)' },
  },
  {
    target: 'row',
    state: 'hover',
    declarations: { 'background-color': 'var(--bytm-glass-fill)' },
    important: ['background-color'],
  },
  {
    target: 'row',
    state: 'active',
    declarations: { 'background-color': 'var(--bytm-glass-fill-strong)' },
    important: ['background-color'],
  },
  {
    target: 'rowSelected',
    declarations: {
      'background-color': 'rgba(var(--bytm-accent-rgb), 0.2)',
      color: 'var(--bytm-accent)',
      'box-shadow': 'inset 0 0 0 1px var(--bytm-glass-stroke)',
    },
    important: ['background-color'],
  },
  { target: 'rowDetails', declarations: { color: 'var(--bytm-text-primary)' } },
  { target: 'rowSecondary', declarations: { color: 'var(--bytm-text-secondary)' } },
  {
    target: 'playerPage',
    declarations: {
      ...ambientBackground,
      'background-color': 'var(--bytm-background-base)',
      color: 'var(--bytm-text-primary)',
    },
    important: [
      'background-color',
      'background-image',
      'background-attachment',
      'background-repeat',
    ],
  },
  {
    target: 'queue',
    declarations: {
      ...surface,
      'background-color': 'var(--bytm-background-layer1)',
      'border-color': 'var(--bytm-glass-stroke)',
    },
  },
  {
    target: 'player',
    declarations: {
      ...surface,
      'background-color': 'var(--bytm-player-surface)',
      'box-shadow':
        'inset 0 1px 0 var(--bytm-glass-stroke), inset 0 2px 0 var(--bytm-glass-fill), 0 -10px 32px rgba(0, 0, 0, 0.16)',
    },
    important: ['background-color'],
  },
  {
    target: 'playerArtwork',
    declarations: {
      'border-radius': 'var(--bytm-radius-1)',
      'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.2)',
    },
  },
  { target: 'playerControl', declarations: { color: 'var(--bytm-text-secondary)' } },
  {
    target: 'playerControl',
    state: 'hover',
    declarations: {
      color: 'var(--bytm-accent)',
      'box-shadow': 'inset 0 0 0 1px var(--bytm-glass-stroke)',
    },
  },
  { target: 'playerIcon', declarations: { fill: 'currentColor' } },
  { target: 'progress', declarations: { 'accent-color': 'var(--bytm-accent)' } },
  { target: 'volume', declarations: { 'accent-color': 'var(--bytm-accent)' } },
  {
    target: 'keyboardFocus',
    declarations: {
      'outline-color': 'var(--bytm-accent)',
      'outline-style': 'solid',
      'outline-width': '2px',
      'outline-offset': '2px',
    },
    important: ['outline-color', 'outline-style', 'outline-width', 'outline-offset'],
  },
  {
    target: 'canvas',
    state: 'selection',
    declarations: {
      color: 'var(--bytm-text-primary)',
      'background-color': 'rgba(var(--bytm-accent-rgb), 0.22)',
    },
  },
];
