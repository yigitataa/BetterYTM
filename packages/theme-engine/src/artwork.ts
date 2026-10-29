import type { ThemeDefinition } from '@better-ytm/shared';

type RGB = readonly [number, number, number];
type HSL = readonly [number, number, number];
export interface ArtworkPalette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceElevated: string;
  readonly ambience: string;
  readonly accent: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function hsl([r, g, b]: RGB): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (!delta) return [0, 0, l];
  const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [(hue * 60 + 360) % 360, delta / (1 - Math.abs(2 * l - 1)), l];
}

function hex([h, s, l]: HSL): string {
  const a = s * Math.min(l, 1 - l);
  return `#${[0, 8, 4]
    .map((n) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** Bounded RGBA thumbnail sampling. Whites/black borders cannot drown out cover colors. */
export function extractArtworkPalette(pixels: ArrayLike<number>): ArtworkPalette | null {
  const bins = new Map<number, { sum: number[]; weight: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const alpha = pixels[i + 3]! / 255;
    if (![r, g, b, alpha].every(Number.isFinite) || alpha < 0.5) continue;
    const [, saturation, lightness] = hsl([r, g, b]);
    const weight = alpha * (0.15 + saturation) * (lightness < 0.06 || lightness > 0.94 ? 0.08 : 1);
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key) ?? { sum: [0, 0, 0], weight: 0 };
    bin.sum[0]! += r * weight;
    bin.sum[1]! += g * weight;
    bin.sum[2]! += b * weight;
    bin.weight += weight;
    bins.set(key, bin);
  }
  const colors = [...bins.values()].sort((a, b) => b.weight - a.weight);
  if (!colors.length) return null;
  const toHsl = (bin: (typeof colors)[number]) =>
    hsl([bin.sum[0]! / bin.weight, bin.sum[1]! / bin.weight, bin.sum[2]! / bin.weight]);
  const [h, s] = toHsl(colors[0]!);
  const secondary = colors.find((bin) => {
    const [hue, saturation] = toHsl(bin);
    const distance = Math.abs(hue - h);
    return (
      bin.weight >= colors[0]!.weight * 0.12 &&
      saturation > 0.2 &&
      Math.min(distance, 360 - distance) > 28
    );
  });
  const [otherHue, otherSaturation] = secondary ? toHsl(secondary) : [h, s];
  // Neutral artwork stays neutral; no arbitrary hue is introduced for grayscale covers.
  const chroma = s < 0.08 ? 0 : clamp(s, 0.3, 0.72);
  return {
    background: hex([h, chroma * 0.9, 0.095]),
    surface: hex([h, chroma * 0.8, 0.135]),
    surfaceElevated: hex([otherHue, chroma ? clamp(otherSaturation, 0.24, 0.52) : 0, 0.185]),
    ambience: hex([otherHue, chroma ? clamp(otherSaturation, 0.34, 0.74) : 0, 0.5]),
    accent: hex([h, chroma ? clamp(s, 0.36, 0.74) : 0, 0.78]),
  };
}

export function themeWithArtwork(
  theme: ThemeDefinition,
  palette: ArtworkPalette | null,
): ThemeDefinition {
  if (!palette || !theme.config.artworkAccent) return theme;
  const { accent, ...surfaces } = palette;
  return { ...theme, palette: surfaces, config: { ...theme.config, accent } };
}
