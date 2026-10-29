/** Owned Shadow DOM UI; all colors follow the existing theme tokens. */
export const LISTEN_TOGETHER_CSS = `
:host { color-scheme: dark; font: 15px/1.5 Roboto, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
dialog { width: min(1080px, calc(100vw - 40px)); max-width: calc(100vw - 24px); max-height: calc(100dvh - 40px); padding: 0; overflow: auto; border: 1px solid var(--bytm-glass-stroke, #45474e); border-radius: 22px; background: var(--bytm-surface-solid, #181c26); color: var(--bytm-text-primary, #f5f5f5); box-shadow: 0 24px 90px #0006; }
dialog::backdrop { background: #0009; }
header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 28px; border-bottom: 1px solid var(--bytm-glass-stroke, #45474e); }
h1 { font-size: 19px; margin: 0; } h2 { font-size: 26px; line-height: 1.2; margin: 0 0 16px; } h3 { font-size: 17px; margin: 0 0 16px; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; padding: 10px 16px; border-radius: 10px; background: transparent; border: 1px solid var(--bytm-glass-stroke, #45474e); }
button:hover:not(:disabled) { background: var(--bytm-glass-fill-strong, #ffffff15); }
button:disabled { opacity: .48; cursor: default; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--bytm-accent, #d6e5a7); outline-offset: 3px; }
.primary { color: var(--bytm-surface-solid, #181c26); background: var(--bytm-accent, #d6e5a7); border-color: transparent; font-weight: 600; }
.primary:hover:not(:disabled) { background: var(--bytm-accent, #d6e5a7); filter: brightness(1.08); }
.close { width: 40px; height: 40px; padding: 0; font-size: 26px; line-height: 1; }
main { padding: 24px 32px; } p { margin: 0 0 14px; } .status { color: var(--bytm-accent, #d6e5a7); font-size: 13px; }
.error { border-left: 2px solid var(--bytm-accent, #d6e5a7); padding: 8px 12px; background: var(--bytm-glass-fill, #ffffff0c); overflow-wrap: anywhere; }
.lead, .hint, small, footer { color: var(--bytm-text-secondary, #c2c4c8); }
.welcome { max-width: 560px; padding: 16px 0; } .lead { line-height: 1.6; margin-bottom: 24px; }
label { display: block; font-size: 14px; margin-bottom: 16px; }
input { display: block; width: 100%; min-width: 0; padding: 11px 13px; margin-top: 7px; background: var(--bytm-background-base, #11151c); border: 1px solid var(--bytm-glass-stroke, #45474e); border-radius: 10px; }
input::placeholder { color: var(--bytm-text-secondary, #c2c4c8); opacity: .8; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; } details { margin-bottom: 18px; } summary { cursor: pointer; margin-bottom: 12px; }
.hint { font-size: 13px; line-height: 1.6; } .room-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; } .room-code { letter-spacing: 3px; font-size: 19px; font-variant-numeric: tabular-nums; color: var(--bytm-accent, #d6e5a7); }
.invite-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; margin-bottom: 28px; } .invite-row input { margin: 0; font-size: 13px; }
.workspace { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr); gap: 32px; }
.add-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; margin-bottom: 8px; } .add-form label { margin: 0; } .add-form button { margin-bottom: 0; }
.queue { padding: 0; margin: 24px 0 0; list-style: none; } .queue > li { display: flex; gap: 12px; align-items: center; padding: 15px 0; border-top: 1px solid var(--bytm-glass-stroke, #45474e); } .queue-info { flex: 1; min-width: 0; } .queue-actions { display: flex; gap: 4px; flex: 0 0 auto; } .queue-actions button { padding: 6px 9px; font-size: 13px; }
.title { margin: 0 0 4px; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; } .artist { font-size: 14px; color: var(--bytm-text-secondary, #c2c4c8); overflow-wrap: anywhere; }
.player { padding: 22px; border-radius: 16px; background: var(--bytm-glass-fill, #ffffff0c); margin-bottom: 26px; } img { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; float: left; margin: 0 14px 14px 0; } .player .actions { clear: both; } .player .actions button { font-size: 13px; padding: 9px 12px; }
.members { list-style: none; padding: 0; margin: 0 0 20px; } .members li { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; padding: 8px 0; overflow-wrap: anywhere; } small { font-size: 12px; } .leave { margin-top: 6px; }
footer { padding: 8px 32px 24px; font-size: 12px; line-height: 1.6; }
@media (max-width: 760px) { .workspace { grid-template-columns: minmax(0, 1fr); gap: 28px; } main { padding: 20px; } header { padding: 16px 20px; } footer { padding: 8px 20px 20px; } .invite-row { grid-template-columns: minmax(0, 1fr); } dialog { width: calc(100vw - 24px); max-height: calc(100dvh - 24px); border-radius: 16px; } .queue > li { flex-wrap: wrap; } }
`;
