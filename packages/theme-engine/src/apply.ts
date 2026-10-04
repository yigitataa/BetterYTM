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

  function update(nextTheme: ThemeDefinition) {
    if (disposed) throw new Error('Cannot update a disposed theme.');
    const tokens = themeToTokens(nextTheme, media?.matches ?? false);
    for (const [name, value] of Object.entries(tokens)) {
      if (!original.has(name)) {
        original.set(name, {
          value: style.getPropertyValue(name),
          priority: style.getPropertyPriority(name),
        });
      }
      style.setProperty(name, value);
      applied.set(name, value);
    }
    theme = nextTheme;
  }

  const onMotionChange = () => update(theme);
  update(initialTheme);
  media?.addEventListener('change', onMotionChange);

  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
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
