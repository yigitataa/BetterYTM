import type { AdapterCapabilities, AdapterHealth } from './types.js';

export function emptyCapabilities(): AdapterCapabilities {
  return Object.freeze({
    playback: false,
    metadata: false,
    trackIdentity: false,
    artwork: false,
    position: false,
    duration: false,
    volume: false,
    playPause: false,
    seeking: false,
    next: false,
    previous: false,
    openTrack: false,
  });
}

export function healthSignature(health: AdapterHealth): string {
  return JSON.stringify([health.status, health.profileId, health.capabilities, health.diagnostics]);
}

/** Report a diagnostic only when it enters the current state, not on every tick. */
export function createDiagnosticReporter() {
  let previous = new Set<string>();
  return {
    report(health: AdapterHealth) {
      const next = new Set(health.diagnostics.map(({ code }) => code));
      for (const diagnostic of health.diagnostics) {
        if (!previous.has(diagnostic.code))
          console.warn(`[Better YTM] Adapter ${diagnostic.code}: ${diagnostic.message}`);
      }
      previous = next;
    },
    reset() {
      previous.clear();
    },
  };
}
