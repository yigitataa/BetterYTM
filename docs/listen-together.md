# Birlikte Dinle: başlangıç temeli

Durum: gezinme girişi ve ekran hazır; gerçek oda bağlantısı henüz yok.
Tema geliştirmeleri kullanıcının isteğiyle beklemede. Mevcut tema tokenları tüketilir.

## Ürün yönü

Çalışma adı **Birlikte Dinle**, referans deneyim Spotify Jam.
Spotify'ın [resmî açıklaması](https://support.spotify.com/article/jam/), aynı ortamda
ortak sıra ile uzaktan dinlemeyi iki ayrı kullanım olarak sunuyor. Kullanıcının
seçimiyle ilk sürüm kapsamı **ayrı cihazlarda senkron dinleme ve ortak sıra birlikte**.
Herkes kendi YouTube Music oturumundan dinler. Oynatma yetkisi için başlangıç
önerisi oda sahibi kontrolüdür; ayrıntılı izinler henüz kesinleşmedi.

İlk çalışan oda dilimi için önerilen davranış:

- Oda oluşturma ve kod/bağlantıyla katılma; katılımcı listesi.
- Oda sahibi oynatır, duraklatır, sarar ve parçayı değiştirir.
- Her üye ortak sıraya şarkı ekler; sıradaki parçalar ve ekleyen kişi görünür.
- Başlangıç yetki önerisi: sıradan silme ve yeniden sıralama oda sahibinde.
- Her katılımcı kendi cihazında dinler. Ses seviyesi yereldir.
- Bağlantı kopunca durum gösterilir; yeniden bağlanınca tam snapshot alınır.
- Oda sahibi ayrıldığında oda kapanır; otomatik sahip devri daha sonra ele alınır.

Misafir oynatma kontrolü, QR, sohbet, öneriler ve sahip devri sonraki kapsam adaylarıdır.
Özelliği tanımlarken netleştirilecek kararlar: misafirlerin silme/sıralama izinleri,
görünen ad/kimlik ve oda sahibinin kopma toleransı.

## Bu değişiklikte çalışanlar

- Arama yanındaki kompakt gezinmede, kitaplığın ardından erişilebilir grup ikonu.
- İkonun açtığı geniş Birlikte Dinle ekranı. YTM'ye sahte bir `/jam` rotası eklemez;
  Shadow DOM içinde native modal dialog kullanır. Bu aşamada bir web adresi değildir.
- Ekranda adapter üzerinden canlı parça/sanatçı/kapak ve gerçek kontrol hazırlığı.
- Escape/kapat, odak geri dönüşü, dar ekran düzeni ve yalnızca açıkken abonelik.
- Eklenti disable/pagehide/reinjection yolunda UI ve abonelikler temizlenir.
- Shared pakette strict Zod oda/parça/ortak sıra/snapshot/event şemaları ve yerel snapshot'ın
  paylaşılabilir alanlara açık projeksiyonu. Bunlar **taslak v1** sözleşmeleridir.

Oda oluştur/katıl düğmeleri henüz yok; var olmayan bağlantı çalışıyormuş gibi gösterilmez.
Yeni paket, sunucu endpoint'i, ağ bağlantısı veya Chrome izni eklenmedi.

## Mevcut altyapı ve boşluklar

| Katman                               | Hazır                                                                                                | Sonraki ihtiyaç                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/ytm-adapter`               | Parça kimliği, metadata, snapshot, event, play/pause/seek/openTrack, health                          | Parça geçişinde sayfa yenilenmesini ve hazır olma durumunu yönetmek             |
| `apps/extension/src/listen-together` | İzole ekran, görünürken abonelik                                                                     | Oda state/controller, bağlantı ve hata durumları                                |
| `packages/shared/src/room.ts`        | Sınırlı metadata, yerel ses alanlarından arınmış playback, üyeler, host, revision, snapshot envelope | Create/join/leave/command/ack/ping/error mesajları                              |
| `apps/extension/src/background`      | MV3 lifecycle, storage ve settings mesajlaşması                                                      | Doğrulanan oda mesajlaşması, bağlantı sahipliği ve restart/reconnect            |
| `apps/server`                        | Node HTTP `/health`                                                                                  | WebSocket, oda deposu, üyelik/token kontrolü, revision, zaman aşımı, rate limit |
| Sync engine                          | Henüz yok                                                                                            | Saat ölçümü, hedef pozisyon, drift, eski revision reddi, loop suppression       |

Host selector'ları adapter'da kalır. UI ve gelecekteki sync engine DOM taramaz.
Sunucu yalnızca parça kimliği ve gerekli oynatma/üyelik durumunu taşır; ses taşınmaz.
Şemalar yetkilendirme sağlamaz: host kimliği ve üyelik sunucudaki doğrulanmış
bağlantıdan belirlenmeli, istemcinin rol iddiasına güvenilmemelidir.

## Bağlantı tasarımı

Önerilen sınır: UI → oda controller → extension messaging → service worker
WebSocket → authoritative room server. Sunucu transport ve istemci komut şemaları,
kapsam kararı sonrası tek dikey dilim içinde eklenmeli.

Ortak sıra sunucuda tutulmalı ve global oda revision'ına dahil edilmeli.
Sıra yalnızca yaklaşan parçaları içerir; şu an çalan parça playback alanındadır.
Aynı şarkı birden çok kez eklenebilir; her ekleme ayrı bir entry ID alır.
Ekleyen üye ayrılırsa şarkısı sırada kalır. Şemadaki 50 üye/200 parça sınırları
başlangıç korumalarıdır, kesinleşmiş ürün limitleri değildir.
Misafirler yalnızca izin verilen komutları göndermeli; sunucu rolü, bağlantıyı,
komut kimliğini ve beklenen revision'ı doğrulayıp değişikliği atomik uygulamalı.
Yerel YTM sırası ile oda sırası ayrı tutulmalı. Oda sırası YTM'nin özel API'lerine
bağlanmadan yönetilmeli; host parça bitişinde sunucudan sonraki parçayı istemeli.
Yerel autoplay ile oda geçişinin yarışması ve sayfa yenilemesinde devam etme
ilk dikey dilimin iki istemci testine dahil edilmeli.

[Chrome WebSocket rehberi](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)
service worker için Chrome 116+ ve 30 saniyelik etkinlik aralığında mesaj alışverişi
öneriyor. Proje şu an Chrome 111 hedefliyor. Worker bağlantısı uygulanırken bu alt
sınır/esbuild hedefi birlikte güncellenmeli; aktif bağlantıda örneğin 20 saniye
heartbeat, kontrollü reconnect ve worker yeniden başlayınca tam snapshot gerekir.

[Chrome ağ istekleri rehberine](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
göre content script cross-origin fetch için sayfanın origin kısıtlarına tabidir;
worker üzerinden HTTP bootstrap/health kullanılacaksa yalnızca seçilen sunucu
origin'i için host izni değerlendirilmelidir. Sunucu adresi belirlenmediğinden
bu değişiklikte geniş izin istenmedi. Üretim bağlantısı WSS olmalıdır.

Tek bir oda bağlantısının hangi YTM sekmesine ait olduğu açıkça tutulmalı.
Kalıcı client kimliği ile sekme/bağlantı kimliği ayrılmalı. Oda tokenları DOM'a veya
loglara yazılmamalı; restore için uygun extension storage kullanılmalı.

## Senkronizasyonun kritik noktaları

- Adapter `openTrack()` şu anda public watch URL'ye `location.assign` yapıyor.
  Bu, content runtime'ı yeniden başlatabilir. Join tokenı ve oda kimliği worker'da
  korunmalı; yeni content runtime hazır olduğunda snapshot tekrar alınmalı.
- `capturedAt` istemcinin duvar saatidir. Sunucu zamanı yerine kullanılamaz.
  Oda playback'i sunucu zamanına bağlanmalı; ilk bağlantıda birkaç ping ile saat
  farkı/RTT kestirilmeli. `serverTimeMs`, revision ve üyelik sunucuya aittir.
- Önerilen başlangıç toleransı: 250 ms altında düzeltme yapma; 750 ms üzerinde
  seek düşün. Buffering, reklam/erişim farkı, track readiness ve autoplay engeli
  açıkça ele alınmalı. Bu eşikler henüz canlı test edilmiş ürün davranışı değildir.
- Gelen remote komutun ürettiği adapter event'i yeni yerel komut diye yayınlanmamalı.
  Revision ve eventId sıralama/deduplikasyon için kullanılmalı.
- Tarayıcı oynatmayı reddederse kullanıcıya YTM'den başlatma gereği gösterilmeli.
  Farklı hesapların parçaya erişimi ve reklam zamanlaması eşzamanlılığı etkileyebilir.

## Doğrulama

Otomatik: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build`.
Protokol testleri alan sızıntısı, geçersiz kimlik/pozisyon, yinelenen üye,
odada olmayan host, envelope/snapshot revision uyumsuzluğu ve ortak sıra kimliklerini kontrol eder.

Yerel tarayıcı fixture'ında ikonun görünmesi, Enter/Space ile açılma, Escape ile
kapanma ve odağa dönüş, açık ekranda metadata güncellemesi, 600px pencere düzeni
ve unmount sonrası sıfır UI kökü/stylesheet/toolbar kontrol edildi. Bu fixture
kontrolü canlı Chrome/YTM kabulünün yerine geçmez.

Chrome kabulü: eklentiyi yeniden yükle, YTM sekmesini yenile; ikonun kitaplıktan
sonra geldiğini, Enter/Space ile ekranı açtığını, Escape ile kapandığını, odağa
dönüşü ve müziğin devamını kontrol et. Ekran açıkken YTM parçasını medya tuşlarıyla
değiştir; metadata güncellenmeli. 100/125/150% ölçekte ve dar pencerede kaydırma
çalışmalı. Disable/re-enable ve sekme yenileme sonrasında tek UI kökü olmalı.

İki gerçek istemciyle create/join/sync/reconnect kabulü, oda sistemi uygulandığında
ayrı yapılacak. Bu başlangıç çalışması gerçek çok kullanıcılı senkronizasyon sağlamaz.
