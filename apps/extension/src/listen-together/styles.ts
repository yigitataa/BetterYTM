/** Owned Shadow DOM UI only; never styles native YouTube Music surfaces. */
export const LISTEN_TOGETHER_CSS = `
:host { color-scheme: dark; font-family: Roboto, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
dialog {
  width: min(1040px, calc(100vw - 48px)); max-height: calc(100dvh - 64px);
  padding: 0; overflow: auto; border: 1px solid var(--bytm-glass-stroke, #45474e);
  border-radius: 22px; background: var(--bytm-surface-solid, #181c26);
  color: var(--bytm-text-primary, #f5f5f5); box-shadow: 0 24px 90px #0006;
}
dialog::backdrop { background: #0009; }
header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px 32px; border-bottom: 1px solid var(--bytm-glass-stroke, #45474e); }
.brand { margin: 0; font-size: 16px; font-weight: 600; }
button { font: inherit; color: inherit; cursor: pointer; }
.close { width: 40px; height: 40px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid var(--bytm-glass-stroke, #45474e); border-radius: 12px; background: transparent; font-size: 26px; line-height: 1; }
button:hover { background: var(--bytm-glass-fill-strong, #ffffff15); }
button:focus-visible { outline: 2px solid var(--bytm-accent, #d6e5a7); outline-offset: 4px; }
main { padding: 40px 40px 32px; }
.intro { max-width: 640px; }
.label { margin: 0 0 14px; color: var(--bytm-accent, #d6e5a7); font-size: 14px; font-weight: 600; }
h1 { margin: 0; font-size: clamp(30px, 4vw, 44px); line-height: 1.12; letter-spacing: -1.2px; }
.lead { margin: 20px 0 0; max-width: 520px; font-size: 17px; line-height: 1.6; color: var(--bytm-text-secondary, #c2c4c8); }
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, .85fr); gap: 48px; margin-top: 40px; }
h2 { font-size: 17px; margin: 0 0 20px; }
dl { margin: 0; }
dl > div { margin-bottom: 22px; }
dt { font-size: 15px; font-weight: 600; }
dd { margin: 7px 0 0; color: var(--bytm-text-secondary, #c2c4c8); font-size: 14px; line-height: 1.6; }
.player { align-self: start; padding: 24px; background: var(--bytm-glass-fill, #ffffff0c); border-radius: 16px; }
.track { display: flex; align-items: center; gap: 16px; min-width: 0; }
img { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex: 0 0 auto; }
[hidden] { display: none !important; }
.metadata { min-width: 0; }
.title { margin: 0; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.artist { margin: 7px 0 0; font-size: 14px; color: var(--bytm-text-secondary, #c2c4c8); overflow-wrap: anywhere; }
.readiness { margin: 24px 0 0; font-size: 14px; line-height: 1.6; color: var(--bytm-text-secondary, #c2c4c8); }
.note { margin: 24px 0 0; padding-top: 20px; border-top: 1px solid var(--bytm-glass-stroke, #45474e); font-size: 14px; line-height: 1.6; color: var(--bytm-text-secondary, #c2c4c8); }
footer { padding: 20px 40px 28px; font-size: 13px; line-height: 1.6; color: var(--bytm-text-secondary, #c2c4c8); }
@media (max-width: 680px) {
  dialog { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); border-radius: 16px; }
  header { padding: 16px 20px; }
  main { padding: 28px 24px 20px; }
  .workspace { grid-template-columns: minmax(0, 1fr); gap: 24px; margin-top: 28px; }
  footer { padding: 12px 24px 24px; }
}
`;
