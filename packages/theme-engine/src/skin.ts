import { themeDefinitionSchema, type ThemeDefinition } from '@better-ytm/shared';
import { applyTheme, type AppliedTheme } from './apply.js';

export interface AppliedVisualSkin extends AppliedTheme {
  /** Manual diagnostics only: suspend paint without persisting settings. */
  setVisible(visible: boolean): void;
  isVisible(): boolean;
}

const owners = new WeakMap<Document, AppliedVisualSkin>();

/** Only owned stylesheet/root state. YTM DOM/selector knowledge belongs to adapter. */
export function applyVisualSkin(
  document: Document,
  initialTheme: ThemeDefinition,
  stylesheet: string,
): AppliedVisualSkin {
  const initial = themeDefinitionSchema.parse(initialTheme);
  owners.get(document)?.dispose();
  const root = document.documentElement;
  const previous = new Map(
    ['data-bytm-enabled', 'data-bytm-theme'].map((name) => [name, root.getAttribute(name)]),
  );
  const written = new Map<string, string>();
  const sheet = document.createElement('style');
  sheet.id = 'better-ytm-visual-skin';
  sheet.textContent = stylesheet;
  let tokens: AppliedTheme | undefined;
  let disposed = false;
  let visible = true;
  function attribute(name: string, value: string) {
    root.setAttribute(name, value);
    written.set(name, value);
  }
  function restore() {
    for (const [name, value] of previous) {
      if (root.getAttribute(name) !== written.get(name)) continue;
      if (value === null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    }
  }
  try {
    tokens = applyTheme(document, initial);
    document.head.append(sheet);
    attribute('data-bytm-theme', initial.id);
    attribute('data-bytm-enabled', 'true');
  } catch (error) {
    sheet.remove();
    tokens?.dispose();
    restore();
    throw error;
  }
  const skin: AppliedVisualSkin = {
    update(theme) {
      if (disposed) throw new Error('Cannot update a disposed visual skin.');
      const validated = themeDefinitionSchema.parse(theme);
      tokens?.update(validated);
      attribute('data-bytm-theme', validated.id);
    },
    isVisible() {
      return !disposed && visible;
    },
    setVisible(next) {
      if (disposed) throw new Error('Cannot toggle a disposed visual skin.');
      visible = next;
      attribute('data-bytm-enabled', String(next));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      visible = false;
      sheet.remove();
      restore();
      tokens?.dispose();
      previous.clear();
      written.clear();
      tokens = undefined;
      if (owners.get(document) === skin) owners.delete(document);
    },
  };
  owners.set(document, skin);
  return skin;
}
