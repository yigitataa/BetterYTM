import type { Track, TrackMetadata } from '@better-ytm/shared';

export function watchUrlForVideoId(videoId: string): string | null {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const url = new URL('/watch', 'https://music.youtube.com');
  url.searchParams.set('v', videoId);
  return url.href;
}

/** Public watch-link identity only, never the browsing URL or media src/currentSrc. */
export function videoIdFromWatchLink(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !['music.youtube.com', 'www.youtube.com', 'youtube.com'].includes(url.hostname) ||
      url.pathname !== '/watch'
    )
      return null;
    const id = url.searchParams.get('v');
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function safeArtworkUrl(value: string | null, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() || null;

export function readMetadata(
  nodes: {
    title: Element | null;
    artist: Element | null;
    artwork: Element | null;
    trackLink: Element | null;
  },
  base: string,
): TrackMetadata {
  // src/currentSrc are read exclusively on the mapped IMG artwork, never on media.
  const image = nodes.artwork?.localName === 'img' ? (nodes.artwork as HTMLImageElement) : null;
  return Object.freeze({
    title: text(nodes.title),
    artist: text(nodes.artist),
    artworkUrl: safeArtworkUrl(image ? image.currentSrc || image.getAttribute('src') : null, base),
    videoId: videoIdFromWatchLink(
      nodes.trackLink?.localName === 'a' ? nodes.trackLink.getAttribute('href') : null,
      base,
    ),
  });
}

export function trackFromMetadata(
  metadata: TrackMetadata,
  durationMs: number | null,
): Track | null {
  if (!metadata.videoId) return null;
  return Object.freeze({
    id: `youtube:${metadata.videoId}`,
    videoId: metadata.videoId,
    ...(metadata.title ? { title: metadata.title } : {}),
    ...(metadata.artist ? { artist: metadata.artist } : {}),
    ...(metadata.artworkUrl ? { artworkUrl: metadata.artworkUrl } : {}),
    ...(durationMs !== null ? { durationMs } : {}),
  });
}
