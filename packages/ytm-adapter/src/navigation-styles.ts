import { NAVIGATION_SELECTORS as host } from './selectors.js';

const scope = ':where(html)[data-bytm-navigation="compact"]';

/** Intentional navigation layout changes, separate from the paint-only theme compiler. */
export const COMPACT_NAVIGATION_CSS = `
${scope} ${host.app}[guide-collapsed] { --ytmusic-guide-width: 0px !important; }
${scope} :is(${host.primarySections}, ${host.primary}, ${host.guideButtons}, ${host.guidePromo}, ${host.miniGuide}, ${host.miniBackground}) { display: none !important; }
/* Header columns deliberately do not use --ytmusic-guide-width. Native guide,
   search-page and wide-screen rules otherwise shift or overlap the search group. */
${scope} ${host.bar} {
  display: grid !important; grid-template-columns: 176px minmax(0, 1fr) auto;
  column-gap: 24px; align-items: center; padding-inline: 16px !important;
}
${scope} ${host.headerLeft} { width: 100% !important; min-width: 0; padding: 0 !important; }
${scope} ${host.center} {
  position: static !important; width: auto !important; min-width: 0; column-gap: 12px;
  left: auto !important; right: auto !important; transform: none !important;
  padding: 0 !important; margin: 0 !important; justify-content: flex-start !important;
}
${scope} ${host.headerRight} { position: static !important; padding: 0 !important; margin: 0 !important; }
${scope} ${host.search} { flex: 1 1 240px; min-width: 0; max-width: 480px; margin: 0 !important; }
${scope} #better-ytm-navigation-shortcuts { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
${scope} #better-ytm-navigation-shortcuts a {
  display: grid; place-items: center; width: 40px; height: 40px; box-sizing: border-box;
  color: var(--bytm-text-secondary); text-decoration: none; border-radius: 12px;
  background: transparent; border: 1px solid transparent;
  transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
}
${scope} #better-ytm-navigation-shortcuts a:hover { color: var(--bytm-text-primary); background: var(--bytm-glass-fill-strong); border-color: var(--bytm-glass-stroke); }
${scope} #better-ytm-navigation-shortcuts a[aria-current="page"] { color: var(--bytm-accent); background: rgba(var(--bytm-accent-rgb), 0.16); border-color: var(--bytm-glass-stroke); }
${scope} #better-ytm-navigation-shortcuts a:focus-visible { outline: 2px solid var(--bytm-accent); outline-offset: 2px; }
${scope} #better-ytm-navigation-shortcuts a:active { background: rgba(var(--bytm-accent-rgb), 0.24); }
${scope} #better-ytm-navigation-shortcuts svg { width: 23px; height: 23px; fill: currentColor; pointer-events: none; }
@media (max-width: 615px) {
  ${scope} ${host.bar} { grid-template-columns: 148px minmax(0, 1fr) auto; column-gap: 8px; padding-inline: 12px !important; }
  ${scope} ${host.center} { column-gap: 4px; }
  ${scope} #better-ytm-navigation-shortcuts { gap: 0; }
  ${scope} #better-ytm-navigation-shortcuts a { width: 32px; height: 36px; border-radius: 10px; }
  ${scope} #better-ytm-navigation-shortcuts svg { width: 21px; height: 21px; }
}
@media (prefers-reduced-motion: reduce) {
  ${scope} #better-ytm-navigation-shortcuts a { transition: none; }
}
`;
