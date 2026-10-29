import { type ThemeDefinition } from '@better-ytm/shared';
import { themeToTokens } from './tokens.js';

export interface AppliedTheme {
  update(theme: ThemeDefinition): void;
  dispose(): void;
}

// Only extension-namespaced root variables are owned here. There are no YTM selectors.
export function applyTheme(document: Document, initialTheme: ThemeDefinition): AppliedTheme {
  const root = document.documentElement;
  const style = root.style;
  const hadStyleAttribute = root.hasAttribute('style');
  const media = document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
  const original = new Map<string, { value: string; priority: string }>();
  const applied = new Map<string, string>();
  let theme = initialTheme;
  let disposed = false;
  const view = document.defaultView;
  let frame: number | undefined;

  function cancelAnimation() {
    if (frame !== undefined) view?.cancelAnimationFrame(frame);
    frame = undefined;
  }

  function write(name: string, value: string) {
    style.setProperty(name, value);
    applied.set(name, value);
  }

  function color(value: string): number[] | null {
    if (/^#[\da-f]{6}$/i.test(value))
      return [1, 3, 5]
        .map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16))
        .concat(1);
    const match = value.match(/^rgba?\(([^)]+)\)$/) ?? value.match(/^(\d+,\s*\d+,\s*\d+)$/);
    if (!match) return null;
    const channels = match[1]!.split(',').map(Number);
    return channels.length === 3 ? channels.concat(1) : channels;
  }

  function update(nextTheme: ThemeDefinition, immediate = false) {
    if (disposed) throw new Error('Cannot update a disposed theme.');
    cancelAnimation();
    const tokens = themeToTokens(nextTheme, media?.matches ?? false);
    const transitions: { name: string; from: number[]; to: number[]; target: string }[] = [];
    const animate =
      !immediate &&
      !!view?.requestAnimationFrame &&
      !media?.matches &&
      nextTheme.config.motion !== 'reduced';
    for (const [name, value] of Object.entries(tokens)) {
      if (!original.has(name)) {
        original.set(name, {
          value: style.getPropertyValue(name),
          priority: style.getPropertyPriority(name),
        });
      }
      const from = color(applied.get(name) ?? '');
      const to = color(value);
      if (animate && from && to && applied.get(name) !== value)
        transitions.push({ name, from, to, target: value });
      else write(name, value);
    }
    theme = nextTheme;
    if (transitions.length && view) {
      let start: number | undefined;
      const duration = nextTheme.config.motion === 'expressive' ? 900 : 720;
      const tick = (time: number) => {
        start ??= time;
        const progress = Math.min(1, (time - start) / duration);
        // Show the new cover's color immediately, then let the glass settle gently.
        const ease = 1 - (1 - progress) ** 3;
        for (const { name, from, to, target } of transitions) {
          const channels = from.map((channel, i) => channel + (to[i]! - channel) * ease);
          const rgb = channels.slice(0, 3).map(Math.round).join(', ');
          write(
            name,
            progress === 1
              ? target
              : target.includes('(') || target.startsWith('#')
                ? `rgba(${rgb}, ${channels[3]!.toFixed(3)})`
                : rgb,
          );
        }
        frame = progress < 1 ? view.requestAnimationFrame(tick) : undefined;
      };
      frame = view.requestAnimationFrame(tick);
    }
  }

  const onMotionChange = () => update(theme, true);
  update(initialTheme, true);
  media?.addEventListener('change', onMotionChange);

  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimation();
      media?.removeEventListener('change', onMotionChange);
      for (const [name, previous] of original) {
        // Preserve subsequent changes made by another owner of the same variable.
        if (style.getPropertyValue(name) !== applied.get(name) || style.getPropertyPriority(name))
          continue;
        if (previous.value) style.setProperty(name, previous.value, previous.priority);
        else style.removeProperty(name);
      }
      if (!hadStyleAttribute && style.length === 0) root.removeAttribute('style');
      original.clear();
      applied.clear();
    },
  };
}
