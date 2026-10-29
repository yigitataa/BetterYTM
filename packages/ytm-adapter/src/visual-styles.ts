import type { PaintProperty, VisualRule } from '@better-ytm/shared';
import {
  GLASS_ATTRIBUTE,
  GLASS_TARGETS,
  GLASS_VALUE,
  HOST_COLOR_SCOPE,
  HOST_COLOR_VARIABLES,
  SKIN_SCOPE,
  VISUAL_SELECTORS,
} from './selectors.js';

export const PAINT_PROPERTIES: readonly PaintProperty[] = [
  'background-color',
  'background-image',
  'background-attachment',
  'background-repeat',
  'color',
  'border-color',
  'border-radius',
  'box-shadow',
  'text-shadow',
  'outline-color',
  'outline-style',
  'outline-width',
  'outline-offset',
  'fill',
  'stroke',
  'accent-color',
];

/** Runtime allowlist: a future rule cannot accidentally add layout declarations. */
export function compileVisualSkin(rules: readonly VisualRule[]): string {
  const blocks = [
    `${SKIN_SCOPE} ${HOST_COLOR_SCOPE} {\n${Object.entries(HOST_COLOR_VARIABLES)
      .map(([name, token]) => `${name}: var(${token});`)
      .join('\n')}\n}`,
  ];
  for (const rule of rules) {
    const selectors = VISUAL_SELECTORS[rule.target];
    if (!selectors) throw new Error('Unknown visual target.');
    if (rule.state && !['hover', 'active', 'focus-within', 'selection'].includes(rule.state))
      throw new Error('Unknown paint state.');
    for (const property of rule.important ?? [])
      if (!PAINT_PROPERTIES.includes(property))
        throw new Error('Only paint properties can be important.');
    const declarations = Object.entries(rule.declarations).map(([property, value]) => {
      if (!PAINT_PROPERTIES.includes(property as PaintProperty))
        throw new Error(`Non-paint property rejected: ${property}`);
      if (typeof value !== 'string' || /[;{}]|url\s*\(|!important/i.test(value))
        throw new Error('Unsafe visual CSS value.');
      return `${property}: ${value}${rule.important?.includes(property as PaintProperty) ? ' !important' : ''};`;
    });
    if (!selectors.length) continue;
    const state = rule.state === 'selection' ? '::selection' : rule.state ? `:${rule.state}` : '';
    const target = `${SKIN_SCOPE} :is(${selectors.filter((selector) => selector !== 'html').join(', ')})${state}`;
    const prefix = rule.target === 'canvas' ? `${SKIN_SCOPE}${state}, ${target}` : target;
    blocks.push(`${prefix} {\n${declarations.join('\n')}\n}`);
  }
  // Blur lives exclusively on empty, guarded, out-of-flow decoration. It cannot
  // create a new containing block for any actual host descendant.
  const glassSelectors = GLASS_TARGETS.flatMap((target) => VISUAL_SELECTORS[target]).join(', ');
  blocks.push(`${SKIN_SCOPE} :is(${glassSelectors}):where([${GLASS_ATTRIBUTE}="${GLASS_VALUE}"])::before {
content: "" !important;
position: absolute !important;
inset: 0 !important;
z-index: -1 !important;
pointer-events: none !important;
border-radius: inherit;
background-color: transparent;
backdrop-filter: blur(clamp(0px, var(--bytm-blur-3), 24px)) saturate(1.25);
}`);
  return blocks.join('\n\n');
}
