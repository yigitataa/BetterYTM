# Birlikte Dinle

İlk sürüm: ayrı cihazlarda senkron dinleme ve ortak sıra. Sunucu kendi ortamında
çalıştırılır; bu depoya bağlı, önceden yayınlanmış bir ortak sunucu yoktur.

## Kullanım

- Oda sahibi oda oluşturur, kod veya davet bağlantısı paylaşır.
- Katılımcılar görünen adlarıyla katılır. Herkes kendi YTM oturumundan dinler.
- Her üye şarkı ekler. Oda sahibi oynatır/duraklatır, sarar, sırayı taşır/siler
  ve **Sıradakini çal** ile ilerler.
- Host parçası bitince ortak sıranın ilk şarkısı çalınır. Sıra boşsa oda oynatımı durur.
- Ses seviyesi ve sessize alma cihazda kalır. Ekranı kapatmak odadan çıkarmaz.
- Oda sahibi **Odayı bitir**, misafir **Odadan ayrıl** ile çıkar. Müzik bundan
  sonra yerel YTM kontrolünde kalır.

## İlk test: aynı bilgisayarda iki Chrome profili

1. Proje kökünde bağımlılıkları kur ve derle:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build
   pnpm start:server
   ```

   Terminal açık kalmalı. Varsayılan sunucu `127.0.0.1:8787`, WebSocket adresi
   `ws://127.0.0.1:8787/ws`. Sağlık kontrolü: [yerel /health](http://127.0.0.1:8787/health).
   `PORT` başka bir uygulama tarafından kullanılıyorsa `PORT=8789 pnpm start:server`
   çalıştır ve oda formunda da aynı portu seç.

2. Chrome 116 veya üstünde `chrome://extensions` aç. Better YTM'yi yeniden yükle.
   İlk kurulumda **Paketlenmemiş öğe yükle** ile `apps/extension/dist` klasörünü seç.
   Yeni yerel sunucu izinleri manifest'e eklendi. İki profilde de aynı build'i kullan.
   Ardından açık YTM sekmelerini yenile; yalnızca eklentiyi yeniden yüklemek yetmez.

3. İlk profilde YTM'de bir şarkıyı açıp en az bir kez oynat. Üst çubukta
   kitaplığın yanındaki **Birlikte Dinle** ikonuna bas. Görünen adını gir,
   **Sunucu bağlantısı** altında `ws://127.0.0.1:8787/ws` bulunduğunu doğrula,
   **Oda oluştur**a bas.

4. İkinci Chrome profilinde aynı eklentiyi yükle ve YTM'ye giriş yap. Oynatıcıyı
   bir kez elle başlatmak tarayıcının ses engelini kaldırır. Birlikte Dinle'yi aç,
   farklı bir görünen ad gir, ilk odanın kodunu veya **Daveti kopyala** ile aldığın
   bağlantıyı yapıştır ve **Odaya katıl**a bas.
   Davet bağlantısı sunucuyu da seçer; yalnızca kod giriyorsan adreslerin aynı
   olması gerekir. Katılma formu açılmadan müzik otomatik olarak paylaşılmaz.

5. İki tarafta da **Odaya bağlı** ve iki dinleyici görünmeli. Misafirden bir
   YouTube Music şarkı bağlantısı ekle. İlk tarafta aynı sıranın görünmesini bekle.
   URL ile eklenen parçanın başlığı henüz bilinmiyorsa video ID gösterilir;
   parça çalınca gerçek metadata güncellenir. **Sende çalanı sıraya ekle** mevcut
   parçanın başlığını da taşır.

6. Oda sahibinde **Oynat/Duraklat**ı dene, ardından YTM'nin kendi ilerleme çubuğundan
   örneğin 30. saniyeye sar. Misafir aynı duruma gelmeli. Misafir yanlışlıkla kendi
   oynatıcısını değiştirirse oda durumuna geri getirilir.

7. İki şarkı ekle. Host'ta yukarı/aşağı ve **Kaldır** ile sırayı değiştir; misafir
   aynı sırayı görmeli ve bu host düğmelerine sahip olmamalı. **Sıradakini çal**a
   bas; iki istemci yeni parçaya geçmeli. Parça geçişi public watch URL üzerinden
   sayfayı yenileyebilir. Bu sırada üyelik korunur; açık oda ekranı geri gelir.

8. Misafir sekmesini yenile. Aynı oda ve üyelik geri gelmeli; ikinci bir misafir
   oluşmamalı. Ses engellenirse **Senkronu başlat**a bas. Escape ile ekranı kapatıp
   ikondan tekrar aç; oda devam etmeli.

9. Misafir **Odadan ayrıl** dediğinde host odası açık kalmalı. Host **Odayı bitir**
   dediğinde diğerleri oda sona erdi mesajını görmeli. Ayarlardan eklentiyi devre
   dışı bırakmak da bağlantıyı ve saklı oda oturumunu temizler.

Tam ses testi için iki farklı YTM hesabı kullan. Aynı hesabın eşzamanlı oynatma
sınırı uygulama tarafından aşılamaz. Tek profil/iki sekme, oda ve sıra arayüzünü
kontrol etmek için kullanılabilir; aynı hesapla çift ses çalmayı garanti etmez.

## Farklı bilgisayarlar / uzaktan dinleme

Ücretsiz test sunucusu için adım adım [Render kurulumu](render-setup.md)
ve depo kökünde hazır `render.yaml` bulunur.

`127.0.0.1` her cihazın kendisidir. Başka bir bilgisayara yerel davet göndermek,
ona senin bilgisayarındaki sunucuya erişim sağlamaz.

1. Bu Node sunucusunun tek bir örneğini ortak bir makinede çalıştır.
2. HTTPS destekleyen bir reverse proxy/hosting ile `/ws` WebSocket upgrade'ını
   bu Node sürecine yönlendir. Dış adres örneği: `wss://rooms.senin-alan-adin.com/ws`.
   Sertifikanın tarayıcıda geçerli olması gerekir.
3. Oda oluştururken **Sunucu bağlantısı** alanına o WSS adresini gir. Diğer
   kullanıcılar aynı adresi seçer veya sunucuyu içeren daveti kullanır.
4. Her cihazda Better YTM ve açık bir YTM oturumu gerekir. Bu bir telefon uygulaması
   veya Chromecast entegrasyonu değildir; Chrome masaüstü eklentisidir.

Sunucu varsayılan olarak localhost'a bağlıdır; aynı makinedeki proxy buna erişebilir.
Container/harici proxy bağlantısı gerekiyorsa sunucuda `HOST=0.0.0.0` ayarlanabilir.
Bu değişiklikte herhangi bir uzak sunucu yayınlanmadı. Uzak düz `ws://` adresleri
kabul edilmez; üretim bağlantısı WSS kullanır.

## Hata durumları

| Durum                                       | Kontrol / beklenen davranış                                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sunucuya bağlanamıyor                       | Terminal açık mı, port ve `/ws` doğru mu? İlk bağlantı üç denemeden sonra açıklayıcı hata verir.                       |
| Kod bulunamadı                              | Aynı sunucuya bağlı mısın? Oda sahibi ayrılmış veya sunucu yeniden başlamış olabilir.                                  |
| Ses başlamıyor                              | YTM'de bir kez elle oynat veya **Senkronu başlat**a bas. Autoplay engeli ekranda gösterilir.                           |
| Parça yüklenmiyor                           | Aynı parçaya kendi hesabında erişebiliyor musun? Yükleme/seek hatası görüntülenir; sürekli reload döngüsü yapılmaz.    |
| Sıra güncellendi uyarısı                    | Başka bir işlem aynı anda uygulandı. Güncel sırada işlemi yeniden yap; eski sıra üzerine yazılmaz.                     |
| Ağ bağlantısı kopuyor                       | Mevcut oda için artan beklemeyle yeniden bağlanır, tam snapshot alır. Kopukken komutlar biriktirilmez.                 |
| Host uzun süre çevrimdışı                   | 90 saniye tolerans sonrası oda kapanır. Kısa refresh/bağlantı kopması oturumu korur.                                   |
| Sunucu yeniden başladı                      | Odalar bellektedir. Eski oda geri getirilemez; yeni oda oluştur.                                                       |
| Eklenti yeniden yüklendi / tarayıcı kapandı | `storage.session` temizlenebilir. Gerekirse kodla tekrar katıl. Normal sekme yenileme ve worker restart'ı desteklenir. |

İlk ses kabulünü normal, reklamsız erişebildiğin müzik parçalarıyla yap. Reklam,
coğrafi erişim veya hesap farkları senkronizasyonu kesintiye uğratabilir; bunlar
atlanmaz. Canlı yayınlarda normal süre/seek davranışı bulunmayabilir. YTM'nin yerel
çalma sırası ile ortak sıra ayrıdır; ortak sıradan ilerlemek için oda ekranındaki
**Sıradakini çal** kullanılır. Tema geliştirmeleri bu çalışma kapsamında yapılmadı.

## Mimari

- `packages/shared/room*.ts`: strict Zod protokolü, public parça/oda/sıra DTO'ları,
  saat ölçümü ve hedef pozisyon hesapları.
- `apps/server/src/rooms.ts`: `ws` sunucusu, üyelik/host yetkisi, random oda kodları,
  secret resume tokenları, revision ve event deduplikasyonu, sıra, süre sınırları.
- `apps/extension/src/background/rooms.ts`: sekme başına bağlantı, yalnızca worker'da
  token saklama, 20 saniye heartbeat, beş başlangıç ping'i, reconnect ve oturum restore.
- `apps/extension/src/listen-together/bridge.ts`: doğrulanan Chrome port mesajları.
- `controller.ts`: adapter üzerinden oynatma; host yayınlama, guest düzeltme,
  remote komutun tekrar yayınlanmasını önleme, track readiness ve autoplay hataları.
- `page.ts`: Shadow DOM içinde erişilebilir oda ekranı. Selector ve ağ kodu içermez.
- `packages/ytm-adapter`: host selector'larının tek sahibi; parça sonunu native
  autoplay öncesi bildirir ve aynı watch sayfasına sonsuz navigasyonu engeller.

Sunucu saati/üyelik/revision otoriterdir. Misafir playback, remove, reorder veya
next komutları sunucuda reddedilir. Her üye yalnızca kendi secret tokenıyla resume
edebilir. Gelen mesajlar boyut ve şema kontrolünden geçer; bağlantı/işlem rate
limitleri, toplam oda/üye/sıra limitleri ve 6 saatlik oda ömrü vardır. Host dışındaki
çevrimdışı üyeler de 90 saniye sonra temizlenir. Anahtarlar DOM'a ve content state'e
verilmez. Ses, medya stream URL'leri, cookie veya YouTube auth bilgileri taşınmaz.
Sunucu yalnızca odanın güncel metadata ve ortak sıra bilgisini bellekte tutar.

Üretim tek Node süreci içindir; birden fazla replica için paylaşılan oda deposu
ve bağlantı koordinasyonu ayrıca gerekir. Varsayılan upgrade origin'i extension
origin'leriyle sınırlıdır; test fixture'ları yalnızca programatik olarak açıkça
verilen origin allowlist'ini kullanır.

Chrome 116 tabanı ve 20 saniyelik worker heartbeat'i
[resmî Chrome WebSocket rehberini](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets)
izler. Yalnızca yerel test sunucusu için `http://127.0.0.1/*` ve `http://localhost/*`
host izinleri eklenir; tüm web siteleri için izin istenmez. Yerel bağlantıların
worker'dan yapılması, content script'in sayfa origin'ine bağlı kısıtlarını da
ayırır. İlgili referanslar:
[Chrome ağ istekleri](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests),
[Chromium extensions yerel ağ açıklaması](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/pUDh8RiTjJk),
[session storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

## Otomatik ve görsel doğrulama

```sh
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:rooms
pnpm build
```

`test:rooms` localhost üzerinde geçici port açar; kısıtlı bir sandbox'ta ağ izni
istemesi normaldir. Testler gerçek `ws` server ve iki client ile çalışır. Runtime
entegrasyonu gerçek worker/controller kodunu, Chrome port/storage fixture'ı ve
kontrollü oynatıcılarla birlikte çalıştırır.

Doğrulananlar: create/join, ortak sıra, host yetkileri, duplicate event reddi,
revision çatışması, play/pause/seek ve drift, parça/ended geçişi, guest echo olmaması,
refresh, socket reconnect, worker restart, secret token izolasyonu, autoplay
hatasından kullanıcı hareketiyle çıkış, feature disable ve oda kapanması.

Ayrıca iki yerel tarayıcı sekmesinde gerçek oda server'ıyla formdan create/join,
misafirden şarkı ekleme, ortak durum, oynatma ve sonraki parçaya geçiş, yenilemede
oda ekranının restore edilmesi ve 600px pencere kontrol edildi. Bu görsel fixture'ın
oynatıcısı simüledir; canlı Chrome/YTM hesabı testi değildir. Bu ortamda Chrome
otomasyonu izinli olmadığından gerçek hesaplarla ses kabulü yukarıdaki adımlarla
kullanıcı tarafından yapılmalıdır.
