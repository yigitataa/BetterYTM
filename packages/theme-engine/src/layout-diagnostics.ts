import type { LayoutBox, LayoutRegion, LayoutSample, LayoutSnapshot } from '@better-ytm/shared';

export interface LayoutComparison {
  readonly status: 'unchanged' | 'changed' | 'inconclusive';
  readonly complete: boolean;
  readonly tolerance: number;
  readonly environmentChanged: boolean;
  readonly regions: Readonly<
    Record<
      LayoutRegion,
      {
        readonly status: 'unchanged' | 'changed' | 'inconclusive' | 'unavailable';
        readonly before: LayoutSample | null;
        readonly after: LayoutSample | null;
        readonly delta: LayoutBox | null;
        readonly differences: readonly string[];
      }
    >
  >;
}

const boxKeys = ['x', 'y', 'width', 'height'] as const;
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/** Pure manual-diagnostic comparison. Missing/replaced elements never count as a pass. */
export function compareLayouts(
  before: LayoutSnapshot,
  after: LayoutSnapshot,
  tolerance = 0,
): LayoutComparison {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1)
    throw new Error('Layout tolerance must be between 0 and 1 CSS pixels.');
  const environmentChanged = ['width', 'height', 'pixelRatio'].some(
    (key) =>
      before.viewport[key as keyof LayoutSnapshot['viewport']] !==
      after.viewport[key as keyof LayoutSnapshot['viewport']],
  );
  const viewportScrolled =
    before.viewport.scrollX !== after.viewport.scrollX ||
    before.viewport.scrollY !== after.viewport.scrollY;
  const regions = {} as LayoutComparison['regions'];
  let changed = false;
  let inconclusive = environmentChanged;
  let measured = 0;
  for (const region of Object.keys(before.regions) as LayoutRegion[]) {
    const a = before.regions[region];
    const b = after.regions[region];
    const delta =
      a && b
        ? Object.freeze({
            x: b.box.x - a.box.x,
            y: b.box.y - a.box.y,
            width: b.box.width - a.box.width,
            height: b.box.height - a.box.height,
          })
        : null;
    let status: LayoutComparison['regions'][LayoutRegion]['status'];
    const differences: string[] = [];
    if (!a && !b) {
      status = 'unavailable';
      differences.push('not present on this page or not mapped');
    } else if (
      !a ||
      !b ||
      a.identity !== b.identity ||
      a.textFingerprint !== b.textFingerprint ||
      environmentChanged
    ) {
      status = 'inconclusive';
      inconclusive = true;
      differences.push('host element/content or viewport changed; repeat on a stable page');
    } else {
      measured++;
      for (const key of boxKeys)
        if (!near(a.box[key], b.box[key], tolerance)) differences.push(`box.${key}`);
      for (const key of Object.keys(a.scroll) as (keyof LayoutSample['scroll'])[])
        if (!near(a.scroll[key], b.scroll[key], tolerance)) differences.push(`scroll.${key}`);
      for (const key of Object.keys(a.typography) as (keyof LayoutSample['typography'])[])
        if (a.typography[key] !== b.typography[key]) differences.push(`typography.${key}`);
      if (
        a.textRects.length !== b.textRects.length ||
        a.textRects.some((rect, index) =>
          boxKeys.some((key) => !near(rect[key], b.textRects[index]?.[key] ?? NaN, tolerance)),
        )
      )
        differences.push('text wrapping/fragment geometry');
      if (viewportScrolled) differences.push('viewport scroll position');
      status = differences.length ? 'changed' : 'unchanged';
      if (status === 'changed') changed = true;
    }
    (regions as Record<LayoutRegion, LayoutComparison['regions'][LayoutRegion]>)[region] =
      Object.freeze({
        status,
        before: a,
        after: b,
        delta,
        differences: Object.freeze(differences),
      });
  }
  return Object.freeze({
    status: changed ? 'changed' : inconclusive || !measured ? 'inconclusive' : 'unchanged',
    complete: measured === Object.keys(before.regions).length,
    tolerance,
    environmentChanged,
    regions: Object.freeze(regions),
  });
}
