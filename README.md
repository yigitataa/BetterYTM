# Better YTM

YouTube Music için tema ve Birlikte Dinle Chrome eklentisi.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start:server
```

Chrome'da `apps/extension/dist` klasörünü paketlenmemiş eklenti olarak yükle veya
mevcut Better YTM eklentisini yeniden yükle. Açık YTM sekmelerini de yenile.

Birlikte Dinle üst çubuktaki grup ikonundan açılır. Varsayılan yerel sunucu:
`ws://127.0.0.1:8787/ws`. Farklı cihazlarda ortak bir WSS sunucusu kullanılmalıdır.

[Kullanım, iki profille test, uzak sunucu ve sorun giderme](docs/listen-together.md).

```sh
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:rooms
```
