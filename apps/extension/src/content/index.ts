import { SETTINGS_STORAGE_KEY } from '@better-ytm/shared';
import { applyTheme, resolveTheme, type AppliedTheme } from '@better-ytm/theme-engine';
import { settings } from '../settings/client.js';

let applied: AppliedTheme | undefined;
let disposed = false;
let pageActive = true;
let revision = 0;

async function refresh() {
  const currentRevision = ++revision;
  const result = await settings.load();
  if (disposed || !pageActive || currentRevision !== revision) return;
  if (!result.ok) {
    applied?.dispose();
    applied = undefined;
    console.error('[Better YTM] Settings unavailable; theme removed:', result.error);
    return;
  }
  if (result.state.diagnostics.length) {
    console.warn('[Better YTM] Settings diagnostics:', result.state.diagnostics);
  }
  if (!result.state.settings.enabled) {
    applied?.dispose();
    applied = undefined;
    return;
  }
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
  chrome.storage.onChanged.removeListener(onStorageChange);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
  applied?.dispose();
  applied = undefined;
}

function onPageHide(event: PageTransitionEvent) {
  if (event.persisted) {
    pageActive = false;
    revision++;
    applied?.dispose();
    applied = undefined;
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
void refresh();
