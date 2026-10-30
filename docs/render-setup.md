# Render Free ile farklı cihazlardan Birlikte Dinle

Tek bir oda sunucusunu yayınla. Her katılımcı kendi Chrome eklentisini kullanır;
arkadaşlarının ayrıca oda sunucusu çalıştırması gerekmez. Mevcut eklenti WSS
bağlantısını destekler. `127.0.0.1` yerine yayınlanan sunucuda yeni oda oluşturulmalı.

## Kurulum

1. Depo kökündeki `render.yaml` dosyasını GitHub'a commit/push et.
2. [Render](https://dashboard.render.com/) hesabını aç ve GitHub depona erişim ver.
3. **New → Blueprint** seç, Better YTM deposunu ve dosyanın bulunduğu branch'i seç.
4. `render.yaml` dosyasının algılandığını, yalnızca `better-ytm-rooms` adlı bir
   **Web Service** oluşturulduğunu ve planının **Free** olduğunu kontrol et.
   Ardından oluştur/deploy işlemini başlat.
5. Servis **Live** olduğunda paneldeki gerçek `https://…onrender.com` adresini al.
   Örneğin panel `https://better-ytm-rooms-abc.onrender.com` verirse şu adresi aç:

   ```text
   https://better-ytm-rooms-abc.onrender.com/health
   ```

   Beklenen yanıt:

   ```json
   { "status": "ok", "service": "better-ytm-server" }
   ```

   Buradaki `abc` örnektir. Panelin verdiği adresi kullan. Ana sayfa `/` için
   `Not found` yanıtı normaldir; kontrol adresi `/health`'tir.

## Eklentide bağlantı

1. Eski yerel odada **Odayı bitir**e bas. Oda sunucular arasında taşınmaz.
2. Yeni oda formunda **Sunucu bağlantısı** bölümünü aç.
3. Render adresinin başındaki `https://` yerine `wss://` yaz ve sonuna `/ws` ekle:

   ```text
   wss://better-ytm-rooms-abc.onrender.com/ws
   ```

4. Görünen adını girip **Oda oluştur**a bas. Yeni davette `127.0.0.1` yerine
   Render adresi olmalı.
5. Arkadaşın bu yeni daveti kendi eklentisinde yapıştırıp **Odaya katıl**a bassın.
   Davet sunucu adresini de içerir. Yalnızca oda kodunu kullanırsa aynı WSS adresini
   onun da sunucu alanına girmesi gerekir.
6. İki dinleyici göründükten sonra misafirden sıraya şarkı ekleyip host'tan
   oynat/duraklat ve sıradakine geçişi kontrol edin.

Sunucu adresi eklenti build'ine gömülmez; bu kurulum için yeni bir eklenti derlemesi
gerekmez. Bilgisayarındaki yerel sunucu terminalini kapatabilirsin; Render'daki
süreç bağımsız çalışır.

## Free plan ve mevcut uygulamanın sınırları

Render Free, 15 dakika gelen trafik olmadığında uyur; yeni istekte uyanma yaklaşık
bir dakika sürebilir. İlk bağlantıdan önce `/health` sayfasını açıp yanıt gelmesini
bekle. Eklentinin ilk üç denemesi uyanma süresinden kısa kalırsa sunucu uyandıktan
sonra yeniden **Oda oluştur/Odaya katıl**a bas.

Render workspace başına aylık 750 ücretsiz instance saati verir; build ve bant
genişliği kotaları da vardır. **Free** planı seçmek limitsiz veya kesintisiz servis
anlamına gelmez. Faturalandırma/harcama limitlerini panelden kontrol et; ücretli
servis veya veritabanı oluşturmak bu kurulum için gerekli değildir.

Mevcut odalar Node sürecinin belleğindedir. Deploy, restart veya uyku sonrası eski
oda bulunamayabilir; yeni oda ve davet oluştur. Tek instance kullan; bu sürümün
odaları farklı sunucu kopyaları arasında paylaşılmaz. Render hesabını bu çalışma
sırasında bağlamadım ve uzak sunucu oluşturmadım; bu dosyalar kurulumu hazırlar.

Resmî kaynaklar:
[Free plan sınırları](https://render.com/docs/free),
[WebSocket desteği](https://render.com/docs/websocket),
[Blueprint kurulumu](https://render.com/docs/blueprint-spec).
