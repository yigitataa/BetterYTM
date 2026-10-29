import { SETTINGS_STORAGE_KEY, type ThemeDefinition } from '@better-ytm/shared';
import {
  applyVisualSkin,
  resolveTheme,
  VISUAL_SKIN_RULES,
  observeArtworkPalette,
  themeWithArtwork,
  type ArtworkPalette,
  type AppliedVisualSkin,
} from '@better-ytm/theme-engine';
import { createYTMAdapter, type YTMAdapter } from '@better-ytm/ytm-adapter';
import { settings } from '../settings/client.js';
import { createLayoutDiagnostics } from './layout-diagnostics.js';

declare global {
  interface Window {
    /** Isolated-world diagnostic API; never bridged into the host page. */
    betterYtmAdapter?: YTMAdapter;
    betterYtmRuntimeDispose?: () => void;
    betterYtmLayout?: ReturnType<typeof createLayoutDiagnostics>;
  }
}

window.betterYtmRuntimeDispose?.();
window.betterYtmAdapter?.destroy();
const adapter = createYTMAdapter(document);
window.betterYtmAdapter = adapter;

const stylesheet = adapter.getVisualSkinStyleSheet(VISUAL_SKIN_RULES);
let applied: AppliedVisualSkin | undefined;
let disposed = false;
let pageActive = true;
let revision = 0;
let unsubscribeRuntime: (() => void) | undefined;
let baseTheme: ThemeDefinition | undefined;
let artworkPalette: ArtworkPalette | null = null;
let artwork: ReturnType<typeof observeArtworkPalette> | undefined;
const layoutDiagnostics = createLayoutDiagnostics(
  adapter,
  document,
  () => applied,
  () => revision,
);
window.betterYtmLayout = layoutDiagnostics;

function stopEnhancements() {
  layoutDiagnostics.cancel();
  unsubscribeRuntime?.();
  unsubscribeRuntime = undefined;
  artwork?.dispose();
  artwork = undefined;
  artworkPalette = null;
  baseTheme = undefined;
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
    unsubscribeRuntime = adapter.subscribe((event) => {
      // Chrome invalidates the old content-script context after extension reload.
      // Stop it on the next host event, or immediately on same-world reinjection.
      // Chrome can remove the runtime namespace from an invalidated world.
      // Reach cleanup rather than throwing and losing this guard subscription.
      if (!chrome.runtime?.id) {
        dispose();
        return;
      }
      if (
        event.type === 'snapshot' ||
        event.type === 'trackchange' ||
        event.type === 'metadatachange'
      )
        artwork?.update(event.metadata.artworkUrl);
    });
  }
  adapter.initialize();
  if (disposed || !pageActive || currentRevision !== revision) return;
  try {
    const theme = resolveTheme(result.state.settings.theme);
    baseTheme = theme;
    if (!theme.config.artworkAccent) {
      artwork?.dispose();
      artwork = undefined;
      artworkPalette = null;
    }
    const visualTheme = themeWithArtwork(theme, artworkPalette);
    if (applied) applied.update(visualTheme);
    else applied = applyVisualSkin(document, visualTheme, stylesheet);
    if (theme.config.artworkAccent) {
      artwork ??= observeArtworkPalette(document, (palette) => {
        artworkPalette = palette;
        if (baseTheme && applied) applied.update(themeWithArtwork(baseTheme, palette));
      });
      artwork.update(adapter.getTrackMetadata().artworkUrl);
    }
    if (theme.config.glassBlur > 0) {
      const glass = adapter.enableVisualGlass();
      if (!glass.ok) console.warn('[Better YTM] Decorative blur unavailable:', glass.error);
    } else adapter.disableVisualGlass();
    console.info(`[Better YTM] Visual skin ready: ${theme.name}.`);
  } catch (error) {
    artwork?.dispose();
    artwork = undefined;
    artworkPalette = null;
    adapter.disableVisualGlass();
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
  if (window.betterYtmLayout === layoutDiagnostics) delete window.betterYtmLayout;
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
