import type { LayoutBox, LayoutRegion, LayoutSample, LayoutSnapshot } from '@better-ytm/shared';
import { LAYOUT_SELECTORS, visualNodes } from './selectors.js';

const box = (rect: DOMRect): LayoutBox =>
  Object.freeze({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });

/** Read on explicit manual request only. No observers, timers or mutation. */
export function createLayoutCapture(document: Document) {
  let nextIdentity = 1;
  const identities = new WeakMap<Element, number>();
  return (): LayoutSnapshot => {
    const view = document.defaultView;
    if (!view) throw new Error('Host layout measurement needs the window.');
    const regions = {} as Record<LayoutRegion, LayoutSample | null>;
    for (const region of Object.keys(LAYOUT_SELECTORS) as LayoutRegion[]) {
      const element = visualNodes(document, LAYOUT_SELECTORS[region]).find((node) => {
        const rect = node.getBoundingClientRect();
        const style = view.getComputedStyle(node);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.visibility !== 'collapse'
        );
      });
      if (!element) {
        regions[region] = null;
        continue;
      }
      let identity = identities.get(element);
      if (!identity) {
        identity = nextIdentity++;
        identities.set(element, identity);
      }
      const style = view.getComputedStyle(element);
      const textRects: LayoutBox[] = [];
      let textFingerprint = 5381;
      // Sample bounded text fragments, not complete page text or resource data.
      if (['card', 'row', 'controls', 'search'].includes(region)) {
        const walker = document.createTreeWalker(element, 4 /* SHOW_TEXT */);
        const range = document.createRange();
        let node: Node | null;
        let count = 0;
        while ((node = walker.nextNode()) && count < 48 && textRects.length < 96) {
          const text = node.textContent?.trim() ?? '';
          if (!text) continue;
          count++;
          for (const char of text.slice(0, 512))
            textFingerprint = ((textFingerprint * 33) ^ char.charCodeAt(0)) >>> 0;
          range.selectNodeContents(node);
          for (const rect of Array.from(range.getClientRects()).slice(0, 8))
            if (rect.width > 0 && rect.height > 0) textRects.push(box(rect));
        }
      }
      regions[region] = Object.freeze({
        identity,
        box: box(element.getBoundingClientRect()),
        scroll: Object.freeze({
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          scrollLeft: element.scrollLeft,
          scrollTop: element.scrollTop,
        }),
        typography: Object.freeze({
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
        }),
        textRects: Object.freeze(textRects),
        textFingerprint,
      });
    }
    return Object.freeze({
      capturedAt: Date.now(),
      viewport: Object.freeze({
        width: view.innerWidth,
        height: view.innerHeight,
        pixelRatio: view.devicePixelRatio,
        scrollX: view.scrollX,
        scrollY: view.scrollY,
      }),
      regions: Object.freeze(regions),
    });
  };
}
