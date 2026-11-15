---
sayfa: performans-calisma-alanim
yazar: krtbu
guncelleme: 2026-11-15T10:05:39.379Z
kosu: KOS-2026-0041
iz_arayuz: 9202418d07527fc6
iz_veri: 74ae34d0f518a7fd
iz_studio: cc449b2048b52667
---

## Amaç
Kullanıcının bireysel performans işlerini tek ekranda gösterir: Geciken ve Yakında gruplarındaki açık işler (plan düzeltme, değerlendirme onayı), "Durumum" adlı yıllık puan özeti ve işaretli günleri olan bir aylık takvim. Kalibrasyon ya da dönem yönetimi bu sayfada yapılmaz.

## Ekranlar
- Ana ekran: sekme başlığı "IMS | Çalışma alanım"; gezinti yolu Ana sayfa / Performans yönetimi / Çalışma alanım.
- İşler bölümü: üstte açık iş sayacı, altında Geciken ve Yakında grupları ve grup sayıları; her işte tarih rozeti, gecikme ya da kalan gün etiketi ve bir eylem düğmesi (Düzelt, Onay) var.
- Durumum paneli: yıl, durum etiketi (ör. Hedefe yakın), puan, hedefe fark, hedefteki gösterge sayısı, en yüksek ve en düşük ay, girilen ölçüm sayısı.
- Takvim paneli: içinde bulunulan ay; işi olan günler işaretli, sonraki aya geçilebiliyor.
- Gösterge listesi: veri girişi son tarihleri "X'de açılır" ya da "12 Kas 2026" biçiminde gösteriliyor.

## Beklentiler
- Açık iş sayacı, Geciken ve Yakında grup sayılarının toplamına eşit olmalı. (güven: yüksek)
- Kalan gün etiketi, bugün ile işin tarihi arasındaki gün farkıyla tutmalı; aynı tarihli işler aynı değeri, daha geç tarihli işler daha büyük değeri göstermeli. (güven: yüksek)
- Gecikme etiketi ("N gün gecikti") bugün ile işin tarihi arasındaki farkla tutmalı; Ekim ve 10 Kasım tarihli işlerde doğru hesaplanıyor. (güven: yüksek)
- Geciken grubundaki her iş, plan düzeltme işleri dâhil, gecikme süresi etiketi göstermeli. (güven: orta)
- Durumum'da bütün göstergeler hedefteyse durum etiketi ile hedefe fark olumsuz olmamalı; etiket, fark ve hedefteki gösterge sayısı birbiriyle tutarlı olmalı. (güven: orta)
- Takvimdeki işaretli günler, listedeki işlerin tarihleriyle birebir örtüşmeli. (güven: orta)
- Sayfadaki bütün tarihler tek bir Türkçe biçimde gösterilmeli; "EKİ 20", "1 Ara'da açılır" ve "12 Kas 2026" bir arada kullanılmamalı. (güven: yüksek)
- Girilen ölçüm sayısı "girilen / beklenen" biçimindedir; girilen değer beklenenden büyük olmamalı. (güven: düşük)
- Aynı kavram aynı büyük/küçük harfle yazılmalı: gezinti yolu ile menüdeki "Ana sayfa" ve modül adları birbirini tutmalı. (güven: yüksek)
- Kalibrasyon oturumu, dönem ilerletme ve yayın bu sayfada yer almaz; tanıma göre bunlar performans-donem ve performans-kalibrasyonlar sayfalarında yapılır (pf-donem-islem, pf-kalibrasyon-islem). (güven: orta)

## Kapsanan
- Açılış: başlık, gezinti yolu ve menü metinleri okundu.
- Açık iş sayacı ile grup toplamları karşılaştırıldı; tutarsız (bilinen sorun).
- Geciken ve Yakında etiketlerindeki gün hesapları bugünkü tarihle karşılaştırıldı.
- Plan düzeltme ve değerlendirme ikinci onayı iş satırlarının içeriği incelendi.
- Durumum paneli: puan, hedefe fark, durum etiketi ve en yüksek/en düşük ay okundu.
- Takvimdeki işaretli günler ile iş tarihleri karşılaştırıldı.
- Tarih biçimi karışıklığı ve büyük/küçük harf tutarsızlıkları kaydedildi.
- Kalibrasyonsuz ilerletme kuralı tanımdan çıkarıldı; ekranla ilgisi yok, bu sayfada kalibrasyon girişi bulunmuyor.

## Kapsanmayan
- Eylem düğmeleri (Düzelt, Onay) ve açtıkları hedef sayfa ya da pencere; yalnız gezinme denenmeli, kaydetme denenmemeli.
- Takvimde önceki ve sonraki aya geçiş, işaretli güne tıklayınca ne olduğu.
- Durumum panelinde yıl değiştirme ve en yüksek/en düşük aya tıklayınca açılan ayrıntı.
- Gösterge listesindeki satırlara tıklayınca gidilen veri girişi sayfası.
- Dar ekranda kartlarda taşma ve hizalama (ekrana_bak goruntu=true ile bakılmadı).
- Sağdaki performans-donem ve performans-kalibrasyonlar sayfalarının menüden açılıp açılmadığı.
- Boş durum: hiç açık işi olmayan kullanıcıda bölümün nasıl göründüğü.

## Tuhaflıklar
- Kalan gün değeri koşudan koşuya kayıyor (1 Aralık için 25 ya da 26 gün); bu bilinen yz:isler-kalan-gun-tarihle-celisiyor sorunudur, yeni anahtar açılmamalı.
- Gösterge adında "şikâyet", menüde "Şikayet Yönetimi" yazıyor; gösterge adı veri kaydıdır, şapkalı harfi ise desen gözü takip ediyor.
- Kişi ve plan adları (ör. TEST-PLAN PJ 2027, 'Burak KURT') demo verisidir; yazımları ekran sorunu sayılmaz.
- Bu sayfada kalibrasyon girişi ya da bekleyen kalibrasyon bilgisinin olmaması bulgu değildir; sayfa yalnız bireysel işleri gösteriyor.
- Sayfa bağlantılarında performans-kalibrasyonlar yok; sayfa page_get ile var olarak doğrulandı, menü listesi kırpılmış olabilir.
