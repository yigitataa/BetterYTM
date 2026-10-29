import type { GlassBindingHealth, GlassTarget } from '@better-ytm/shared';
import {
  containsGlassTarget,
  GLASS_ATTRIBUTE,
  GLASS_TARGETS,
  GLASS_VALUE,
  VISUAL_SELECTORS,
  visualNodes,
} from './selectors.js';

const zeroMetrics = [
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
];

/** Only 3 elevated surfaces; no cards/rows, polling or host geometry mutations. */
export function bindVisualGlass(document: Document) {
  const view = document.defaultView;
  if (!view) throw new Error('Visual glass needs the host window.');
  const marked = new Map<GlassTarget, Element>();
  const candidates = new Set<Element>();
  let health: GlassBindingHealth = Object.freeze({ enabled: true, eligible: [], skipped: {} });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attributes = new view.MutationObserver((records) => {
    if (records.some(({ attributeName }) => !attributeName?.startsWith('data-bytm-'))) schedule();
  });

  function clearMarks() {
    for (const element of marked.values()) {
      if (element.getAttribute(GLASS_ATTRIBUTE) === GLASS_VALUE)
        element.removeAttribute(GLASS_ATTRIBUTE);
    }
    marked.clear();
  }

  function refresh() {
    if (stopped) return;
    clearMarks();
    attributes.disconnect();
    candidates.clear();
    const observed = new Set<Element>();
    const eligible: GlassTarget[] = [];
    const skipped: Partial<Record<GlassTarget, string>> = {};
    for (const target of GLASS_TARGETS) {
      const nodes = visualNodes(document, VISUAL_SELECTORS[target]);
      const element = nodes.length === 1 ? nodes[0] : undefined;
      if (!element) {
        skipped[target] = nodes.length ? 'ambiguous surface' : 'surface absent';
        continue;
      }
      candidates.add(element);
      for (let current: Element | null = element; current; current = current.parentElement)
        observed.add(current);
      if (element.hasAttribute(GLASS_ATTRIBUTE)) {
        skipped[target] = 'reserved attribute already owned';
        continue;
      }
      const style = view!.getComputedStyle(element);
      const before = view!.getComputedStyle(element, '::before');
      const rect = element.getBoundingClientRect();
      const positionedStack =
        style.position === 'fixed' ||
        style.position === 'sticky' ||
        (style.position !== 'static' && style.zIndex !== 'auto' && Number(style.zIndex) >= 0);
      if (!positionedStack) {
        skipped[target] = 'native positioned stacking context required';
        continue;
      }
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.width * rect.height > view!.innerWidth * view!.innerHeight * 0.35
      ) {
        skipped[target] = 'hidden or too large for bounded blur';
        continue;
      }
      const empty = ['none', 'normal'].includes(before.content) && before.display !== 'none';
      const metrics =
        zeroMetrics.every((property) => before.getPropertyValue(property) === '0px') &&
        ['0px', 'auto'].includes(before.minWidth) &&
        ['0px', 'auto'].includes(before.minHeight) &&
        before.width === 'auto' &&
        before.height === 'auto' &&
        before.maxWidth === 'none' &&
        before.maxHeight === 'none';
      if (
        !empty ||
        !metrics ||
        before.transform !== 'none' ||
        before.animationName !== 'none' ||
        before.counterIncrement !== 'none' ||
        before.counterReset !== 'none' ||
        before.transitionDuration.split(',').some((value) => value.trim() !== '0s')
      ) {
        skipped[target] = 'native pseudo content or metrics must be preserved';
        continue;
      }
      element.setAttribute(GLASS_ATTRIBUTE, GLASS_VALUE);
      marked.set(target, element);
      eligible.push(target);
    }
    for (const element of observed) attributes.observe(element, { attributes: true });
    health = Object.freeze({
      enabled: true,
      eligible: Object.freeze(eligible),
      skipped: Object.freeze(skipped),
    });
  }

  function schedule() {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      try {
        refresh();
      } catch {
        cleanup();
        health = Object.freeze({
          enabled: false,
          eligible: [],
          skipped: Object.freeze(
            Object.fromEntries(
              GLASS_TARGETS.map((target) => [target, 'glass probe failed; paint-only fallback']),
            ),
          ),
        });
        console.warn(
          '[Better YTM] Decorative blur probing failed; paint-only surfaces remain available.',
        );
      }
    }, 100);
  }

  const discovery = new view.MutationObserver((records) => {
    if ([...candidates].some((element) => !element.isConnected)) {
      schedule();
      return;
    }
    for (const record of records)
      for (const node of record.addedNodes)
        if (containsGlassTarget(node)) {
          schedule();
          return;
        }
  });
  function cleanup() {
    stopped = true;
    discovery.disconnect();
    attributes.disconnect();
    view!.removeEventListener('resize', schedule);
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    clearMarks();
    candidates.clear();
  }
  try {
    refresh();
    discovery.observe(document.documentElement, { childList: true, subtree: true });
    view.addEventListener('resize', schedule);
  } catch (error) {
    cleanup();
    throw error;
  }
  return {
    getHealth: () => health,
    dispose() {
      if (stopped) return;
      cleanup();
      health = Object.freeze({ enabled: false, eligible: [], skipped: {} });
    },
  };
}
