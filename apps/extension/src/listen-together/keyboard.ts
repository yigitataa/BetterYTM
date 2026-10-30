/** Shadow DOM retargets input events to the host div outside the root, so YTM
 * cannot recognize these as typing. Stop them before document shortcut handlers.
 * Keep native defaults for text entry, clipboard, Tab, Enter and dialog Escape.
 */
export function isolateRoomKeyboard(host: HTMLElement): () => void {
  const view = host.ownerDocument.defaultView;
  if (!view) return () => {};
  const options = { capture: true };
  const events = ['keydown', 'keypress', 'keyup'] as const;
  const isolate = (event: KeyboardEvent) => {
    if (event.composedPath().includes(host)) event.stopImmediatePropagation();
  };
  for (const type of events) view.addEventListener(type, isolate, options);
  return () => {
    for (const type of events) view.removeEventListener(type, isolate, options);
  };
}
