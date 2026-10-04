import {
  settingsResultSchema,
  type Settings,
  type SettingsPatch,
  type SettingsRequest,
  type SettingsResult,
} from '@better-ytm/shared';

async function request(message: SettingsRequest): Promise<SettingsResult> {
  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    const parsed = settingsResultSchema.safeParse(response);
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'storage', message: 'Invalid settings response from the service worker.' },
      };
    }
    return parsed.data;
  } catch (error) {
    return {
      ok: false,
      error: { code: 'storage', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const settings = {
  load: () => request({ type: 'better-ytm/settings', operation: 'load' }),
  save: (value: Settings) =>
    request({ type: 'better-ytm/settings', operation: 'save', settings: value }),
  update: (patch: SettingsPatch) =>
    request({ type: 'better-ytm/settings', operation: 'update', patch }),
  reset: () => request({ type: 'better-ytm/settings', operation: 'reset' }),
};
