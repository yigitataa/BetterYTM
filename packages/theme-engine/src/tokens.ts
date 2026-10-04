import { themeDefinitionSchema, type ThemeDefinition } from '@better-ytm/shared';

export type ThemeTokens = Readonly<Record<`--bytm-${string}`, string>>;

function rgb(hex: string, brightness = 1): string {
  return [1, 3, 5]
    .map((offset) =>
      Math.min(255, Math.round(Number.parseInt(hex.slice(offset, offset + 2), 16) * brightness)),
    )
    .join(', ');
}

const px = (value: number) => `${Number(value.toFixed(3))}px`;

export function themeToTokens(theme: ThemeDefinition, reducedMotion = false): ThemeTokens {
  const { config, palette } = themeDefinitionSchema.parse(theme);
  const reduced = reducedMotion || config.motion === 'reduced';
  const duration = reduced
    ? [0, 0, 0, 0]
    : config.motion === 'expressive'
      ? [180, 260, 360, 700]
      : [150, 220, 320, 600];
  const density = { compact: 0.85, comfortable: 1, spacious: 1.15 }[config.density];
  const tokens: Record<`--bytm-${string}`, string> = {
    '--bytm-background-base': `rgb(${rgb(palette.background, config.backgroundBrightness)})`,
    '--bytm-background-layer1': `rgba(${rgb(palette.surface, config.surfaceBrightness)}, ${config.surfaceOpacity})`,
    '--bytm-background-layer2': `rgba(${rgb(palette.surfaceElevated, config.surfaceBrightness)}, ${config.elevatedSurfaceOpacity})`,
    '--bytm-glass-fill': `rgba(255, 255, 255, ${config.glassOpacity})`,
    '--bytm-glass-fill-strong': `rgba(255, 255, 255, ${config.glassStrongOpacity})`,
    '--bytm-glass-stroke': `rgba(255, 255, 255, ${config.glassBorderOpacity})`,
    '--bytm-text-primary': 'rgba(255, 255, 255, 0.96)',
    '--bytm-text-secondary': 'rgba(255, 255, 255, 0.66)',
    '--bytm-text-muted': 'rgba(255, 255, 255, 0.46)',
    '--bytm-accent': config.accent,
    '--bytm-density-scale': String(density),
    '--bytm-ambience-intensity': String(
      config.ambienceEnabled && !reduced ? config.ambienceIntensity : 0,
    ),
    '--bytm-artwork-accent-enabled': config.artworkAccent ? '1' : '0',
  };

  [8, 12, 16, 22, 28].forEach((value, index) => {
    tokens[`--bytm-radius-${index + 1}`] = px((value * config.radius) / 22);
  });
  [8, 14, 22, 32].forEach((value, index) => {
    tokens[`--bytm-blur-${index + 1}`] = px((value * config.glassBlur) / 22);
  });
  [4, 8, 12, 16, 24, 32].forEach((value, index) => {
    tokens[`--bytm-space-${index + 1}`] = px(value * density);
  });
  ['micro', 'standard', 'panel', 'ambient'].forEach((name, index) => {
    tokens[`--bytm-motion-${name}`] = `${duration[index]}ms`;
  });
  return tokens;
}

export function themeToCssProperties(theme: ThemeDefinition, reducedMotion = false): string {
  return Object.entries(themeToTokens(theme, reducedMotion))
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');
}
