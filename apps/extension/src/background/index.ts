import { registerRoomConnections } from './rooms.js';
import { settingsRequestSchema, type SettingsResult } from '@better-ytm/shared';
import { SettingsError, settingsStore } from '../settings/store.js';

registerRoomConnections();

// Register listeners synchronously; storage is authoritative after worker restarts.
chrome.runtime.onMessage.addListener(
  (message: unknown, sender, respond: (result: SettingsResult) => void) => {
    if (
      sender.id !== chrome.runtime.id ||
      !message ||
      typeof message !== 'object' ||
      !('type' in message) ||
      message.type !== 'better-ytm/settings'
    )
      return false;

    const parsed = settingsRequestSchema.safeParse(message);
    if (!parsed.success) {
      respond({ ok: false, error: { code: 'validation', message: parsed.error.message } });
      return false;
    }

    const request = parsed.data;
    const operation =
      request.operation === 'save'
        ? settingsStore.save(request.settings)
        : request.operation === 'update'
          ? settingsStore.update(request.patch)
          : request.operation === 'reset'
            ? settingsStore.reset()
            : settingsStore.load();

    void operation
      .then((state) => {
        if (state.diagnostics.length)
          console.warn('[Better YTM] Settings diagnostics:', state.diagnostics);
        respond({ ok: true, state });
      })
      .catch((error: unknown) => {
        const failure: SettingsResult = {
          ok: false,
          error: {
            code: error instanceof SettingsError ? error.code : 'storage',
            message: error instanceof Error ? error.message : String(error),
          },
        };
        console.error('[Better YTM] Settings operation failed:', failure.error);
        respond(failure);
      });
    return true;
  },
);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.info(`[Better YTM] Extension lifecycle: ${reason}.`);
  void settingsStore
    .load()
    .then((state) => {
      if (state.diagnostics.length)
        console.warn('[Better YTM] Settings diagnostics:', state.diagnostics);
    })
    .catch((error: unknown) => {
      console.error('[Better YTM] Settings initialization failed:', error);
    });
});
