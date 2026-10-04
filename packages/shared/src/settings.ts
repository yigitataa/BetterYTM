import { z } from 'zod/v3';
import { themeConfigSchema, themeOverridesSchema, themePresetIdSchema } from './theme.js';

export const SETTINGS_SCHEMA_VERSION = 1;
export const SETTINGS_STORAGE_KEY = 'betterYtm.settings';

export const settingsSchema = z.strictObject({
  schemaVersion: z.literal(SETTINGS_SCHEMA_VERSION),
  enabled: z.boolean(),
  theme: z.strictObject({
    presetId: themePresetIdSchema,
    overrides: themeOverridesSchema,
  }),
});

export const settingsPatchSchema = z.strictObject({
  enabled: z.boolean().optional(),
  theme: z
    .strictObject({
      presetId: themePresetIdSchema.optional(),
      overrides: themeOverridesSchema.optional(),
    })
    .optional(),
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type SettingsStatus = 'current' | 'defaulted' | 'migrated' | 'repaired' | 'future-version';

export interface SettingsState {
  settings: Settings;
  status: SettingsStatus;
  diagnostics: string[];
}

export interface SettingsMigration extends SettingsState {
  shouldPersist: boolean;
}

export type SettingsResult =
  | { ok: true; state: SettingsState }
  | { ok: false; error: { code: 'storage' | 'validation' | 'future-version'; message: string } };

export const settingsResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({
    ok: z.literal(true),
    state: z.strictObject({
      settings: settingsSchema,
      status: z.enum(['current', 'defaulted', 'migrated', 'repaired', 'future-version']),
      diagnostics: z.array(z.string()),
    }),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.enum(['storage', 'validation', 'future-version']),
      message: z.string(),
    }),
  }),
]);

export const settingsRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({ type: z.literal('better-ytm/settings'), operation: z.literal('load') }),
  z.strictObject({
    type: z.literal('better-ytm/settings'),
    operation: z.literal('save'),
    settings: settingsSchema,
  }),
  z.strictObject({
    type: z.literal('better-ytm/settings'),
    operation: z.literal('update'),
    patch: settingsPatchSchema,
  }),
  z.strictObject({ type: z.literal('better-ytm/settings'), operation: z.literal('reset') }),
]);

export type SettingsRequest = z.infer<typeof settingsRequestSchema>;

export function createDefaultSettings(): Settings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: true,
    theme: { presetId: 'midnight-glass', overrides: {} },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// v0 is an unversioned/zero-version record, optionally using the former themeId field.
// Unknown newer schemas are never rewritten by an older extension.
export function migrateSettings(value: unknown): SettingsMigration {
  const settings = createDefaultSettings();
  if (value === undefined) {
    return { settings, status: 'defaulted', diagnostics: [], shouldPersist: true };
  }

  const source = record(value);
  if (typeof source.schemaVersion === 'number' && source.schemaVersion > SETTINGS_SCHEMA_VERSION) {
    settings.enabled = false;
    return {
      settings,
      status: 'future-version',
      diagnostics: ['Settings were written by a newer extension. They have been preserved.'],
      shouldPersist: false,
    };
  }

  const current = settingsSchema.safeParse(value);
  if (current.success) {
    return { settings: current.data, status: 'current', diagnostics: [], shouldPersist: false };
  }

  const diagnostics: string[] = [];
  if (Object.keys(source).length === 0)
    diagnostics.push('Invalid settings record; defaults restored.');
  if (
    source.schemaVersion !== undefined &&
    source.schemaVersion !== 0 &&
    source.schemaVersion !== SETTINGS_SCHEMA_VERSION
  ) {
    diagnostics.push('Invalid schemaVersion; known fields recovered.');
  }

  if (typeof source.enabled === 'boolean') settings.enabled = source.enabled;
  else if (source.enabled !== undefined) diagnostics.push('Invalid enabled; default restored.');

  const theme = record(source.theme);
  const legacy = source.schemaVersion === undefined || source.schemaVersion === 0;
  if (
    source.theme !== undefined &&
    (source.theme === null || typeof source.theme !== 'object' || Array.isArray(source.theme))
  ) {
    diagnostics.push('Invalid theme record; default restored.');
  }
  const preset = theme.presetId ?? (legacy ? source.themeId : undefined);
  if (preset !== undefined) {
    const parsed = themePresetIdSchema.safeParse(preset);
    if (parsed.success) settings.theme.presetId = parsed.data;
    else diagnostics.push('Unknown theme preset; default restored.');
  }

  const overrides = record(theme.overrides);
  if (
    theme.overrides !== undefined &&
    (theme.overrides === null ||
      typeof theme.overrides !== 'object' ||
      Array.isArray(theme.overrides))
  ) {
    diagnostics.push('Invalid theme overrides; preset values restored.');
  }
  const validOverrides: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(themeConfigSchema.shape)) {
    if (overrides[key] === undefined) continue;
    const parsed = schema.safeParse(overrides[key]);
    if (parsed.success) validOverrides[key] = parsed.data;
    else diagnostics.push(`Invalid theme.overrides.${key}; preset value restored.`);
  }
  for (const key of Object.keys(overrides)) {
    if (!Object.hasOwn(themeConfigSchema.shape, key)) {
      diagnostics.push(`Unknown theme override ${key}; ignored.`);
    }
  }
  settings.theme.overrides = themeOverridesSchema.parse(validOverrides);

  // Explain structural repairs too, while retaining every valid known field.
  if (!legacy && diagnostics.length === 0) {
    diagnostics.push('Incomplete or unsupported settings fields repaired.');
  }

  return {
    settings,
    status: diagnostics.length > 0 ? 'repaired' : 'migrated',
    diagnostics,
    shouldPersist: true,
  };
}

export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
  const parsed = settingsPatchSchema.parse(patch);
  const presetId = parsed.theme?.presetId ?? current.theme.presetId;
  const overrides = presetId === current.theme.presetId ? current.theme.overrides : {};
  return settingsSchema.parse({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: parsed.enabled ?? current.enabled,
    theme: {
      presetId,
      overrides: { ...overrides, ...parsed.theme?.overrides },
    },
  });
}
