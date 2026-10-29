// v3 uses static parsing; the extension must never include JIT/new Function code.
import { z } from 'zod/v3';

const color = z
  .string()
  .length(7)
  .regex(/^#[\da-f]{6}$/i, 'Expected a six-digit hex color');
const opacity = z.number().min(0).max(1);

export const themePresetIdSchema = z.enum(['midnight-glass', 'graphite', 'warm-night']);
export type ThemePresetId = z.infer<typeof themePresetIdSchema>;

// Flat, JSON-safe controls are also the override format used by future settings UI.
export const themeConfigSchema = z.strictObject({
  accent: color,
  backgroundBrightness: z.number().min(0).max(2),
  surfaceBrightness: z.number().min(0).max(2),
  surfaceOpacity: opacity,
  elevatedSurfaceOpacity: opacity,
  glassOpacity: opacity,
  glassStrongOpacity: opacity,
  glassBorderOpacity: opacity,
  glassBlur: z.number().min(0).max(48),
  radius: z.number().min(0).max(48),
  density: z.enum(['compact', 'comfortable', 'spacious']),
  motion: z.enum(['reduced', 'balanced', 'expressive']),
  ambienceEnabled: z.boolean(),
  ambienceIntensity: opacity,
  artworkAccent: z.boolean(),
});

export type ThemeConfig = z.infer<typeof themeConfigSchema>;
export const themeOverridesSchema = themeConfigSchema.partial();
export type ThemeOverrides = z.infer<typeof themeOverridesSchema>;

export const DEFAULT_THEME_CONFIG: Readonly<ThemeConfig> = Object.freeze({
  accent: '#FF375F',
  backgroundBrightness: 1,
  surfaceBrightness: 1,
  surfaceOpacity: 0.64,
  elevatedSurfaceOpacity: 0.78,
  glassOpacity: 0.075,
  glassStrongOpacity: 0.14,
  glassBorderOpacity: 0.16,
  glassBlur: 24,
  radius: 22,
  density: 'comfortable',
  motion: 'balanced',
  ambienceEnabled: true,
  ambienceIntensity: 1,
  artworkAccent: true,
});

export const themeDefinitionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: themePresetIdSchema,
  name: z.string().trim().min(1).max(64),
  palette: z.strictObject({
    background: color,
    surface: color,
    surfaceElevated: color,
    ambience: color.optional(),
  }),
  config: themeConfigSchema,
});

export type ThemeDefinition = z.infer<typeof themeDefinitionSchema>;
