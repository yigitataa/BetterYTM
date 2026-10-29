import {
  DEFAULT_THEME_CONFIG,
  themeDefinitionSchema,
  type Settings,
  type ThemeDefinition,
} from '@better-ytm/shared';

// These palettes also serve as fallbacks while a cover is unavailable.
export const THEME_PRESETS = [
  {
    schemaVersion: 1,
    id: 'midnight-glass',
    name: 'Midnight Glass',
    palette: { background: '#080A0F', surface: '#0F1219', surfaceElevated: '#181C26' },
    config: { ...DEFAULT_THEME_CONFIG },
  },
  {
    schemaVersion: 1,
    id: 'graphite',
    name: 'Graphite',
    palette: { background: '#0B0C0E', surface: '#17181B', surfaceElevated: '#24262A' },
    config: { ...DEFAULT_THEME_CONFIG, accent: '#B9C5D8', glassOpacity: 0.03 },
  },
  {
    schemaVersion: 1,
    id: 'warm-night',
    name: 'Warm Night',
    palette: { background: '#100B09', surface: '#1C1511', surfaceElevated: '#2A211B' },
    config: { ...DEFAULT_THEME_CONFIG, accent: '#FFB86B' },
  },
] as const satisfies readonly ThemeDefinition[];

export function resolveTheme(selection: Settings['theme']): ThemeDefinition {
  const preset = THEME_PRESETS.find(({ id }) => id === selection.presetId);
  if (!preset) throw new Error(`Unknown theme preset: ${selection.presetId}`);
  return themeDefinitionSchema.parse({
    ...preset,
    config: { ...preset.config, ...selection.overrides },
  });
}
