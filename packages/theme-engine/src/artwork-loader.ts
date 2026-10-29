import { extractArtworkPalette, type ArtworkPalette } from './artwork.js';

/** Public cover images only. No host permissions, private API or media requests. */
export function observeArtworkPalette(
  document: Document,
  onPalette: (palette: ArtworkPalette | null) => void,
) {
  const cache = new Map<string, ArtworkPalette>();
  let current: string | null | undefined;
  let cancel: (() => void) | undefined;
  let disposed = false;
  let revision = 0;

  return {
    update(url: string | null) {
      if (disposed || url === current) return;
      current = url;
      const request = ++revision;
      cancel?.();
      cancel = undefined;
      if (!url) {
        onPalette(null);
        return;
      }
      const cached = cache.get(url);
      if (cached) {
        onPalette(cached);
        return;
      }
      const view = document.defaultView;
      if (!view) {
        onPalette(null);
        return;
      }
      const image = new view.Image();
      const cleanup = () => {
        image.onload = image.onerror = null;
        clearTimeout(timeout);
        image.removeAttribute('src');
      };
      const finish = (palette: ArtworkPalette | null) => {
        cleanup();
        if (disposed || request !== revision) return;
        cancel = undefined;
        if (palette) {
          cache.set(url, palette);
          if (cache.size > 24) cache.delete(cache.keys().next().value!);
        }
        onPalette(palette);
      };
      cancel = cleanup;
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 48;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context || !image.naturalWidth || !image.naturalHeight) return finish(null);
          context.drawImage(image, 0, 0, 48, 48);
          finish(extractArtworkPalette(context.getImageData(0, 0, 48, 48).data));
        } catch {
          // Includes canvas CORS failures: preset remains available without extra permissions.
          finish(null);
        }
      };
      image.onerror = () => finish(null);
      const timeout = setTimeout(() => finish(null), 6000);
      image.src = url;
    },
    dispose() {
      disposed = true;
      revision++;
      cancel?.();
      cancel = undefined;
      cache.clear();
    },
  };
}
