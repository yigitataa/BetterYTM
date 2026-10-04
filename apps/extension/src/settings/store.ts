import {
  createDefaultSettings,
  mergeSettings,
  migrateSettings,
  settingsPatchSchema,
  settingsSchema,
  SETTINGS_STORAGE_KEY,
  type SettingsState,
} from '@better-ytm/shared';

export class SettingsError extends Error {
  constructor(
    public readonly code: 'validation' | 'future-version',
    message: string,
  ) {
    super(message);
  }
}

// All read/modify/write operations go through this service-worker queue.
// Rejection is passed to the caller; only the queue tail recovers for the next operation.
let pending: Promise<unknown> = Promise.resolve();
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

async function readSettings(): Promise<SettingsState> {
  const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const migrated = migrateSettings(stored[SETTINGS_STORAGE_KEY]);
  if (migrated.shouldPersist) {
    await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: migrated.settings });
  }
  return {
    settings: migrated.settings,
    status: migrated.status,
    diagnostics: migrated.diagnostics,
  };
}

function assertWritable(state: SettingsState) {
  if (state.status === 'future-version') {
    throw new SettingsError(
      'future-version',
      'Newer settings are preserved. Use explicit reset to replace them.',
    );
  }
}

async function writeSettings(settings: SettingsState['settings']): Promise<SettingsState> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
  return { settings, status: 'current', diagnostics: [] };
}

export const settingsStore = {
  load: () => enqueue(readSettings),
  save: (value: unknown) =>
    enqueue(async () => {
      const parsed = settingsSchema.safeParse(value);
      if (!parsed.success) throw new SettingsError('validation', parsed.error.message);
      assertWritable(await readSettings());
      return writeSettings(parsed.data);
    }),
  update: (value: unknown) =>
    enqueue(async () => {
      const parsed = settingsPatchSchema.safeParse(value);
      if (!parsed.success) throw new SettingsError('validation', parsed.error.message);
      const current = await readSettings();
      assertWritable(current);
      return writeSettings(mergeSettings(current.settings, parsed.data));
    }),
  reset: () => enqueue(() => writeSettings(createDefaultSettings())),
};
