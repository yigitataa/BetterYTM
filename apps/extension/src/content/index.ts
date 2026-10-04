// Phase 0 intentionally owns no DOM, styles, observers, timers, or page controls.
// Future host-page access must go through packages/ytm-adapter.
console.info(`[Better YTM] Content script ready (v${chrome.runtime.getManifest().version}).`);

export {};
