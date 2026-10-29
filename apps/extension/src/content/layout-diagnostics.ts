import { compareLayouts, type AppliedVisualSkin } from '@better-ytm/theme-engine';
import type { YTMAdapter } from '@better-ytm/ytm-adapter';

function nextPaint(view: Window, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Manual layout check cancelled.'));
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      view.clearTimeout(timeout);
      view.cancelAnimationFrame(frame);
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new Error('Manual layout check cancelled.'));
    const timeout = view.setTimeout(
      () => finish(new Error('Keep the YouTube Music tab visible during the layout check.')),
      1500,
    );
    const frame = view.requestAnimationFrame(() => finish());
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Explicit DevTools use only. Never executes a check during normal startup. */
export function createLayoutDiagnostics(
  adapter: YTMAdapter,
  document: Document,
  getSkin: () => AppliedVisualSkin | undefined,
  getRevision: () => number,
) {
  let checking = false;
  let pending: AbortController | undefined;
  return Object.freeze({
    capture: () => adapter.captureLayout(),
    compare: compareLayouts,
    /** Cancel pending RAF/timeouts during runtime disable/pagehide/disposal. */
    cancel: () => pending?.abort(),
    async check(tolerance = 0) {
      if (checking) throw new Error('A manual layout check is already running.');
      const skin = getSkin();
      const view = document.defaultView;
      if (!skin?.isVisible() || !view)
        throw new Error('Enable Better YTM before checking its layout.');
      const revision = getRevision();
      const valid = () => {
        if (getSkin() !== skin || getRevision() !== revision)
          throw new Error('Settings/runtime changed during measurement; repeat the check.');
      };
      checking = true;
      const controller = new AbortController();
      pending = controller;
      try {
        // Loaded fonts/images and a stable host page remain manual prerequisites.
        valid();
        skin.setVisible(false);
        await nextPaint(view, controller.signal);
        await nextPaint(view, controller.signal);
        valid();
        const before = adapter.captureLayout();
        skin.setVisible(true);
        await nextPaint(view, controller.signal);
        await nextPaint(view, controller.signal);
        valid();
        return compareLayouts(before, adapter.captureLayout(), tolerance);
      } finally {
        checking = false;
        pending = undefined;
        if (getSkin() === skin) skin.setVisible(true);
      }
    },
  });
}
