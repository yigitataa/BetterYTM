# Package boundaries

`shared` contains environment-independent contracts. It has no browser or server dependencies.

The blueprint reserves `ytm-adapter`, `theme-engine`, `sync-engine`, and `ui` as separate packages. They will be created in their relevant phases; Phase 0 does not implement those features. All future YouTube Music selectors and host interactions must remain inside `ytm-adapter`.
