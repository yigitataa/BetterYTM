import { SETTINGS_STORAGE_KEY } from '@better-ytm/shared';
import { applyTheme, resolveTheme, type AppliedTheme } from '@better-ytm/theme-engine';
import { createYTMAdapter, type YTMAdapter } from '@better-ytm/ytm-adapter';
import { settings } from '../settings/client.js';

declare global {
  interface Window {
    /** Isolated-world diagnostic API; never bridged into the host page. */
    betterYtmAdapter?: YTMAdapter;
    betterYtmRuntimeDispose?: () => void;
  }
}

window.betterYtmRuntimeDispose?.();
window.betterYtmAdapter?.destroy();
const adapter = createYTMAdapter(document);
window.betterYtmAdapter = adapter;

let applied: AppliedTheme | undefined;
let disposed = false;
let pageActive = true;
let revision = 0;
let unsubscribeRuntime: (() => void) | undefined;

function stopEnhancements() {
  unsubscribeRuntime?.();
  unsubscribeRuntime = undefined;
  adapter.destroy();
  applied?.dispose();
  applied = undefined;
}

async function refresh() {
  const currentRevision = ++revision;
  const result = await settings.load();
  if (disposed || !pageActive || currentRevision !== revision) return;
  if (!result.ok) {
    stopEnhancements();
    console.error('[Better YTM] Settings unavailable; enhancements disabled:', result.error);
    return;
  }
  if (result.state.diagnostics.length) {
    console.warn('[Better YTM] Settings diagnostics:', result.state.diagnostics);
  }
  if (!result.state.settings.enabled) {
    stopEnhancements();
    return;
  }
  if (!unsubscribeRuntime) {
    unsubscribeRuntime = adapter.subscribe(() => {
      // Chrome invalidates the old content-script context after extension reload.
      // Stop it on the next host event, or immediately on same-world reinjection.
      if (!chrome.runtime.id) dispose();
    });
  }
  adapter.initialize();
  if (disposed || !pageActive || currentRevision !== revision) return;
  try {
    const theme = resolveTheme(result.state.settings.theme);
    if (applied) applied.update(theme);
    else applied = applyTheme(document, theme);
    console.info(`[Better YTM] Theme tokens ready: ${theme.name}.`);
  } catch (error) {
    applied?.dispose();
    applied = undefined;
    console.error('[Better YTM] Theme unavailable; enhancement disabled:', error);
  }
}

const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
  if (pageActive && area === 'local' && Object.hasOwn(changes, SETTINGS_STORAGE_KEY))
    void refresh();
};

function dispose() {
  if (disposed) return;
  disposed = true;
  revision++;
  stopEnhancements();
  try {
    chrome.storage.onChanged.removeListener(onStorageChange);
  } catch {
    console.info(
      '[Better YTM] Chrome context invalidated; page enhancements have been cleaned up.',
    );
  }
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  if (window.betterYtmAdapter === adapter) delete window.betterYtmAdapter;
  if (window.betterYtmRuntimeDispose === dispose) delete window.betterYtmRuntimeDispose;
}

function onPageHide(event: PageTransitionEvent) {
  if (event.persisted) {
    pageActive = false;
    revision++;
    stopEnhancements();
  } else dispose();
}

function onPageShow(event: PageTransitionEvent) {
  if (event.persisted) {
    pageActive = true;
    void refresh();
  }
}

chrome.storage.onChanged.addListener(onStorageChange);
window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);
window.betterYtmRuntimeDispose = dispose;
void refresh();
