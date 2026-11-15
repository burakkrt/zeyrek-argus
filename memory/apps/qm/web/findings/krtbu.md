---
yazar: krtbu
guncelleme: "2026-11-15T08:44:25.455Z"
---
## yz:ana-sayfa-buyuk-kucuk-harf
- baslik: "Ana sayfa" ve "Ana Sayfa" aynı sayfada farklı büyük/küçük harfle geçiyor
- tur: tutarsizlik
- sayfalar: performans-calisma-alanim, performans-donemler, performans-gosterge-olustur
- ilk: 2026-11-14T14:21:59.450Z
- son: 2026-11-15T08:39:56.847Z
- gorulme: 5
- sayfa: performans-donemler
- senaryo: Dönem yönetimi sayfasını aç; sol menüdeki ve gezinti yolundaki ana sayfa bağlantılarına bak.
- beklenen: Aynı bağlantı tek biçimde yazılmalı.
- gozlenen: Gezinti yolunda "Ana sayfa", sol menüde "Ana Sayfa" geçiyor.
- alinti: Ana Sayfa

## yz:anasayfa-yazimi
- baslik: 'Anasayfa' bitişik yazılmış
- tur: kesin
- sayfalar: performans-gosterge, performans-olcum
- ilk: 2026-11-14T10:38:25.480Z
- son: 2026-11-14T10:39:01.267Z
- gorulme: 2
- sayfa: performans-olcum
- senaryo: Bulunamayan bir sayfa adresini aç (ör. /performans-olcum); düğmeye ve açıklamaya bak.
- beklenen: TDK'ye göre "Ana sayfaya dön", "ana sayfaya dönerek".
- gozlenen: Düğmede "Anasayfaya dön", açıklamada "anasayfaya dönerek" bitişik yazılmış.
- alinti: Anasayfaya dön

## yz:calisma-alanim-tarih-bicimi-karisik
- baslik: Aynı sayfada birden çok tarih biçimi: "1 Ara'da açılır", "EKİ 20" ve "12 Kas 2026"
- tur: tutarsizlik
- sayfalar: performans-calisma-alanim
- ilk: 2026-11-13T21:04:55.766Z
- son: 2026-11-14T22:15:04.816Z
- gorulme: 2
- sayfa: performans-calisma-alanim
- senaryo: Çalışma alanım → İşlerim satırlarına ve aşağıdaki Tamamlanan işlerim tablosunun Tarih sütununa bak.
- beklenen: Sayfada tek bir Türkçe tarih biçimi kullanılmalı (ör. 1.12.2026 ya da 1 Aralık 2026).
- gozlenen: İşlerim satır metninde kesme işaretli kısaltma "1 Ara'da açılır", tarih rozetlerinde büyük harfli "EKİ 20 / KAS 10", Tamamlanan işlerim tablosunda "12 Kas 2026", dönemlerde ise "Kasım 2026" kullanılıyor.
- alinti: 1 Ara'da açılır

## yz:ceyrek-surüyor-etiketi-gecmis-donem
- baslik: Ocak süzgecinde 1. çeyrek "sürüyor" görünüyor ama puan tüm çeyreğin puanı
- tur: tutarsizlik
- sayfalar: performans-karne
- ilk: 2026-11-13T20:33:55.918Z
- son: 2026-11-13T20:33:55.918Z
- gorulme: 1
- sayfa: performans-karne
- senaryo: Firma karnesini aç; grafikte Ocak ayına tıkla; çeyrek düğmelerine bak.
- beklenen: Son hesaplama 13 Kas 2026; 1. çeyrek kapanmış olduğu için "sürüyor" ibaresi olmamalı. Ya da çeyrek Ocak'a göre hesaplanıyorsa puanı Ocak'ın puanı (84,7) olmalı.
- gozlenen: Düğmede "1. çeyrek · sürüyor 90,8" yazıyor. 90,8, Tüm yıl görünümündeki tam 1. çeyrek puanı. Yani etiket çeyreği devam ediyor gibi gösteriyor, puan ise kapanmış çeyreğin puanı. Ayrıca Tüm yıl görünümünde aynı düğmede "sürüyor" yok; orada eksik çeyrek "· kısmi" ile gösteriliyor.
- alinti: 1. çeyrek · sürüyor

## yz:dif-ac-onay-tarihi-bicim-farki
- baslik: Onay tarihi panelde "17 Şub 2026", tarihçede "17 Şubat 2026"
- tur: tutarsizlik
- sayfalar: performans-dif-ac
- ilk: 2026-11-13T21:05:44.031Z
- son: 2026-11-13T21:05:44.031Z
- gorulme: 1
- sayfa: performans-dif-ac
- senaryo: PLN-2026-01 planını seçin, GST-0010 Oca hücresine tıklayın. Sağ paneldeki Onay tarihini, sol alttaki Tarihçe tarihiyle karşılaştırın.
- beklenen: Aynı sayfada tek bir tarih biçimi olmalı (ör. 17.02.2026 ya da 17 Şubat 2026).
- gozlenen: Aynı onay olayı bağlam panelinde "17 Şub 2026" diye kısaltılmış, Tarihçe listesinde ise "17 Şubat 2026" diye uzun biçimde yazılıyor. Ölçüm matrisinde de aylar "Oca/Şub" diye kısaltılmış.
- alinti: 17 Şub 2026

## yz:donem-2026-ortasi-ad-kod-tarih
- baslik: "2026 Ortası" dönemi DD-2027-02 kodlu ve 15 Şub 2027 – 1 Şub 2028 aralığında
- tur: tutarsizlik
- sayfalar: performans-donem, performans-donemler
- ilk: 2026-11-13T21:06:52.944Z
- son: 2026-11-15T08:39:57.046Z
- gorulme: 3
- sayfa: performans-donemler
- senaryo: Dönem yönetimi sayfasını aç; Tümü listesinde "2026 Ortası" satırına bak.
- beklenen: Dönem adı, kodu ve tarih aralığı aynı yılı göstermeli.
- gozlenen: Ad "2026 Ortası", kod "DD-2027-02", tarih aralığı "15 Şub 2027" – "1 Şub 2028"; ad, kod ve tarihlerle çelişiyor.
- alinti: 2026 Ortası

## yz:donem-hatirlatma-eposta-kapali-alanlar-etkin
- baslik: E-posta gönderimi kapalıyken hatırlatma alanları hâlâ etkin
- tur: tutarsizlik
- sayfalar: performans-donem-olustur, performans-donemler
- ilk: 2026-11-13T21:07:48.329Z
- son: 2026-11-15T07:23:42.308Z
- gorulme: 2
- sayfa: performans-donemler
- senaryo: 1) Dönem yönetimi sayfasında "Yeni dönem" düğmesine bas. 2) Form yüklenince "E-posta hatırlatmaları" bölümüne bak.
- beklenen: E-posta gönderimi kapalıysa "Hatırlatma zamanı" ve "Süre geçince yöneticiye bildir" alanları devre dışı olmalı ya da gizlenmeli.
- gozlenen: Anahtar devre dışı ve "Kapalı" yazıyor, altında "E-posta gönderimi kapalı olduğu için hatırlatma gönderilmez." uyarısı var. Buna rağmen "Hatırlatma zamanı" (5 gün önce) düzenlenebiliyor, ok düğmeleri etkin ve "Süre geçince yöneticiye bildir" kutusu işaretli ve tıklanabilir. Ayar etkisiz olduğu hâlde kullanıcı değer giriyor.
- alinti: E-posta gönderimi kapalı olduğu için hatırlatma gönderilmez.

## yz:donem-kayit-filtresi-yer-tutucu-eksik
- baslik: Kayıt sütun filtresinde yer tutucu yok
- tur: tutarsizlik
- sayfalar: performans-donemler
- ilk: 2026-11-15T08:40:16.825Z
- son: 2026-11-15T08:40:16.825Z
- gorulme: 1
- sayfa: performans-donemler
- senaryo: 1) Dönem yönetimi sayfasını açın. 2) Tablonun ikinci başlık satırındaki filtre kutularına bakın. 3) Kayıt sütunundaki filtreyi Dönem, Form şablonu ve Aşama filtreleriyle karşılaştırın.
- beklenen: Kayıt filtresi de öteki metin filtreleri gibi bir yer tutucu göstermeli (ör. "Filtrele").
- gozlenen: Dönem, Form şablonu ve Aşama filtrelerinde "Filtrele" yer tutucusu var. Kayıt filtresi ise yalnız "=" operatörünü gösteriyor, kutu boş. Plan filtresinde aynı eksiklik bilinen sorun olarak kayıtlı (yz:donem-plan-filtresi-yer-tutucu-eksik); "=" operatörlü filtrelerin ortak kök nedeni olabilir.
- alinti: 

## yz:donem-kayit-katilimci-ad-farki
- baslik: Sayfa açıklaması "katılımcı sayıları" diyor, sütun adı "Kayıt"
- tur: tutarsizlik
- sayfalar: performans-donem, performans-donemler
- ilk: 2026-11-13T21:06:22.745Z
- son: 2026-11-15T08:39:56.946Z
- gorulme: 3
- sayfa: performans-donemler
- senaryo: Dönem yönetimi sayfasını aç; sayfa açıklamasını ve tablo sütun başlıklarını karşılaştır.
- beklenen: Açıklamada ve sütun başlığında aynı kavram aynı adla geçmeli.
- gozlenen: Açıklama "Değerlendirme dönemlerini aşamaları ve katılımcı sayılarıyla listeler." diyor; tabloda "Katılımcı" sütunu yok, sayılar "Kayıt" sütununda.
- alinti: katılımcı sayılarıyla

## yz:donem-liste-filtre-yer-tutucu-eksik
- baslik: Plan ve Kayıt sütun filtrelerinde "Filtrele" yer tutucusu yok
- tur: kesin
- sayfalar: performans-donem
- ilk: 2026-11-13T21:06:22.665Z
- son: 2026-11-13T21:06:22.665Z
- gorulme: 1
- sayfa: performans-donem
- senaryo: Dönem yönetimi sayfasını aç; tablo başlığının altındaki filtre satırına bak.
- beklenen: Tüm metin filtrelerinde Dönem, Form şablonu, Aşama filtrelerindeki gibi "Filtrele" yer tutucusu görünür.
- gozlenen: Plan filtresinde (placeholder boş) ve Kayıt filtresinde yalnız "≈" simgesi var, "Filtrele" yazısı yok; diğer filtrelerle tutarsız.
- alinti: 

## yz:donem-plan-filtresi-yer-tutucu-eksik
- baslik: Plan sütun filtresinde yer tutucu yok
- tur: tutarsizlik
- sayfalar: performans-donemler
- ilk: 2026-11-15T07:20:56.114Z
- son: 2026-11-15T07:20:56.114Z
- gorulme: 1
- sayfa: performans-donemler
- senaryo: Dönem yönetimi sayfasını aç; tablonun filtre satırında Plan sütununa bak.
- beklenen: Dönem, Form şablonu ve Aşama metin filtreleri gibi Plan filtresinde de "Filtrele" yer tutucusu olmalı.
- gozlenen: Dönem ve Form şablonu filtreleri "Filtrele" gösteriyor; Plan filtresinin yer tutucusu boş.
- alinti: 

## yz:donem-plan-kodu-yil-celiskisi
- baslik: 2027 dönemlerinin plan kodu 2029/2030 yılını gösteriyor
- tur: tutarsizlik
- sayfalar: performans-donemler, performans-planlar
- ilk: 2026-11-13T21:45:35.398Z
- son: 2026-11-15T08:39:57.152Z
- gorulme: 4
- sayfa: performans-donemler
- senaryo: Performans → Dönem yönetimi → Tümü sekmesi; "test burak dönem 2" (DD-2027-05) ve "test değerlendirme bir" (DD-2027-04) satırlarındaki Plan sütununa bak.
- beklenen: Plan kodunun yılı, dönem kodunun yılı ve tarih aralığıyla uyumlu olmalı (ör. PLN-2027-xx).
- gozlenen: DD-2027-05 kodlu dönem (15 Şub 2027 – 1 Şub 2028) PLN-2029-01 planına, DD-2027-04 ve DD-2027-03 kodlu dönemler ise PLN-2030-01 planına bağlı. Plan kodlarındaki yıl, dönem kodu ve tarih aralığıyla çelişiyor. Diğer satırlarda kodlar uyumlu: 2026 Ortası/PLN-2026-01 ve 2027 Yıl sonu/PLN-2027-01. Sorun test verisinden kaynaklanıyor olabilir.
- alinti: PLN-2029-01

## yz:donem-plan-secenekleri-siralama
- baslik: Bağlı performans planı seçenekleri tutarlı bir sırada değil
- tur: tutarsizlik
- sayfalar: performans-donemler
- ilk: 2026-11-15T07:24:09.408Z
- son: 2026-11-15T07:24:09.408Z
- gorulme: 1
- sayfa: performans-donemler
- senaryo: Dönem yönetimi > Yeni dönem > 'Bağlı performans planı' açılır listesini aç.
- beklenen: Seçenekler belirli bir düzene göre sıralı olmalı (ör. koda göre azalan: PLN-2027-09, -08, -03, -02).
- gozlenen: Liste yıla göre azalan başlıyor (2030, 2029, 2028), ama 2027 planları PLN-2027-03, PLN-2027-08, PLN-2027-09, PLN-2027-02 sırasıyla karışık geliyor. Bu sıra ne koda ne de ada göre sıralı; [turkce-siralama] kuralıyla çelişiyor.
- alinti: PLN-2027-02 · 2027 Performans planı

## yz:donem-tamamlanan-asamada-kalan-katilimci
- baslik: Hedef belirleme aşaması tamamlanmış görünüyor, ama bir katılımcı hâlâ bu aşamada ve 0 hedefle
- tur: tutarsizlik
- sayfalar: performans-donemler
- ilk: 2026-11-15T07:22:15.746Z
- son: 2026-11-15T07:22:15.746Z
- gorulme: 1
- sayfa: performans-donemler
- senaryo: Dönem yönetimi → Aktif → "2026 Ortası" satırını aç. Aşama şeridine ve Katılımcılar tablosuna bak.
- beklenen: Hedef belirleme tamamlandı (onay işaretli, "1 / 6 tamamlandı") ise katılımcılar Öz değerlendirmede olmalı ve form şablonundaki en az 3 hedefi taşımalı. Ya da şerit bekleyen katılımcıyı göstermeli.
- gozlenen: Şeritte Hedef belirleme onay işaretli ve dönem "Öz değerlendirme" aşamasında. Buna karşın Furkan ÜSTÇAYIR "Hedef belirlemede" durumunda ve Hedef 0 görünüyor. Form şablonu "%60 · 3–6 hedef" diyor; 0 hedef bu kuralla da çelişiyor.
- alinti: 1 / 6 tamamlandı

## yz:durumum-hedefteki-gosterge-puan-celiskisi
- baslik: Durumum: Hedefteki gösterge 3/3, ama puan hedefin 3,8 puan altında
- tur: tutarsizlik
- sayfalar: performans-calisma-alanim
- ilk: 2026-11-13T21:04:55.732Z
- son: 2026-11-14T22:15:04.916Z
- gorulme: 2
- sayfa: performans-calisma-alanim
- senaryo: Çalışma alanım → sayfayı aşağı kaydır → sağdaki Durumum kartı (2026 yılı).
- beklenen: Tüm göstergeler hedefteyse (3/3) puan hedefin altında olmamalı. Puan hedefin altındaysa en az bir gösterge hedefin dışında görünmeli.
- gozlenen: Kartta Puan 96,2 ve Hedefe fark −3,8 puan yazıyor, durum etiketi "Hedefe yakın"; aynı kartta "Hedefteki gösterge 3 / 3" yazıyor. Girilen ölçüm 26/30 ve Girilmeyen ölçüm 4 ise listedeki 4 geciken veri girişiyle tutuyor. Etiket adı için yz:esige-yakin-hedefe-yakin sorunu ayrıca açık.
- alinti: 96,2

## yz:esige-yakin-hedefe-yakin
- baslik: Dikkat gerektirenler listesinde "Eşiğe yakın", sayfanın geri kalanında "Hedefe yakın" yazıyor
- tur: tutarsizlik
- sayfalar: performans-karne
- ilk: 2026-11-13T20:34:49.706Z
- son: 2026-11-13T20:34:49.706Z
- gorulme: 1
- sayfa: performans-karne
- senaryo: Performans karnesini Tüm yıl görünümünde aç, Dikkat gerektirenler listesindeki Durum sütununa bak, bunu gösterge sayaçları ve Hedef ağacındaki durum etiketleriyle karşılaştır.
- beklenen: Aynı durum her yerde aynı adla geçmeli (Hedefe ulaşan / Hedefe yakın / Hedefin gerisinde).
- gozlenen: Dikkat gerektirenler listesinde "Eşiğe yakın" ve "Gecikti" etiketleri kullanılıyor. Grafik açıklaması, gösterge sayaçları ve Hedef ağacı ise "Hedefe yakın" etiketini kullanıyor. "Eşiğe yakın" için bir tanım yok, bu yüzden ayrı bir durum mu yoksa aynı durum mu, anlaşılmıyor.
- alinti: Eşiğe yakın

## yz:form-sablonu-unvan-yazimi
- baslik: Form şablonu özetinde "ünvana" yanlış yazılmış
- tur: kesin
- sayfalar: performans-donemler
- ilk: 2026-11-15T07:23:03.311Z
- son: 2026-11-15T07:23:03.311Z
- gorulme: 1
- sayfa: performans-donemler
- senaryo: Dönem yönetimi listesinden "test burak değerlendirme" dönemini açın; sağdaki FORM ŞABLONU panelinde Yetkinlikler satırına bakın.
- beklenen: TDK yazımına uygun "unvana göre set" yazmalı.
- gozlenen: Yetkinlikler satırında "%30 · ünvana göre set" yazıyor; doğru yazım "unvan".
- alinti: ünvana göre set

## yz:gosterge-birim-tipi-siralama
- baslik: Birim tipi seçenekleri alfabetik sırada değil
- tur: kesin
- sayfalar: performans-gosterge-olustur
- ilk: 2026-11-13T21:10:12.784Z
- son: 2026-11-13T21:10:12.784Z
- gorulme: 1
- sayfa: performans-gosterge-olustur
- senaryo: Yeni gösterge sayfasını aç → Birim tipi açılır listesini aç.
- beklenen: Seçenekler Türkçe alfabeye göre sıralı olmalı: Adet, Dakika, Gün, Para (TL), Puan, Saat, Yüzde (%).
- gozlenen: Liste şu sırada: Yüzde (%), Adet, Gün, Saat, Dakika, Para (TL), Puan. Alfabetik değil, turkce-siralama kuralıyla çelişiyor.
- alinti: Para (TL)

## yz:gosterge-olustur-vazgec-tepkisiz
- baslik: Yeni gösterge formunda Vazgeç düğmesi tepki vermiyor
- tur: kesin
- sayfalar: performans-gosterge-olustur
- ilk: 2026-11-14T14:24:21.379Z
- son: 2026-11-14T14:24:21.379Z
- gorulme: 1
- sayfa: performans-gosterge-olustur
- senaryo: Yeni gösterge sayfasında açıklama doldur, Vazgeç'e bas.
- beklenen: Gösterge listesine dönülmeli ya da değişiklikler için onay penceresi çıkmalı.
- gozlenen: Hiçbir şey olmadı; adres aynı, onay penceresi yok, form açık kaldı.
- alinti: Vazgeç

## yz:hedef-agaci-puan-bicimi
- baslik: Hedef ağacı Puan sütununda iki farklı sayı biçimi var
- tur: tutarsizlik
- sayfalar: performans-karne
- ilk: 2026-11-13T20:34:49.673Z
- son: 2026-11-13T20:34:49.673Z
- gorulme: 1
- sayfa: performans-karne
- senaryo: Performans karnesini Tüm yıl görünümünde aç, Hedef ağacı tablosuna in, Puan sütununa bak.
- beklenen: Puan sütunundaki tüm değerler aynı biçimde gösterilmeli (ör. hepsi 99,8 gibi puan).
- gozlenen: Aynı sütunda hedef satırları yüzde işareti olmadan puan olarak gösteriliyor ("99,8", "99,7"), gösterge satırlarında ise başında yüzde işareti var ("%100,0", "%99,4"). Üstteki karne tablosunda puanlar da yüzde işareti olmadan gösteriliyor ("94,6", "103,1").
- alinti: %100,0

## yz:hedef-revizyonu-onay-tarihi-bicim-farki
- baslik: Plan onay tarihi panelde "15 Oca 2026", tarihçede "15 Ocak 2026"
- tur: tutarsizlik
- sayfalar: performans-hedef-revizyonu
- ilk: 2026-11-13T21:12:03.200Z
- son: 2026-11-13T21:12:03.200Z
- gorulme: 1
- sayfa: performans-hedef-revizyonu
- senaryo: Yeni hedef revizyonu sayfasında Plan: PLN-2026-01, Gösterge: GST-0001 seç. Sağ paneldeki Onay tarihine ve tablonun altındaki Tarihçe'ye bak.
- beklenen: Aynı sayfada aynı tarih tek biçimde gösterilmeli.
- gozlenen: Talep bağlamı panelinde Onay tarihi "15 Oca 2026" (kısa ay adı), Tarihçe'de aynı onay "15 Ocak 2026" (tam ay adı) olarak geçiyor. Aynı sayfada iki farklı tarih biçimi kullanılıyor. DİF modülündeki yz:dif-ac-onay-tarihi-bicim-farki sorununun benzeri.
- alinti: 15 Oca 2026

## yz:isler-acik-is-sayisi-liste-toplami
- baslik: "7 açık iş" yazıyor, listede 5 Geciken + 5 Yakında = 10 iş var
- tur: tutarsizlik
- sayfalar: performans-calisma-alanim
- ilk: 2026-11-13T21:04:27.217Z
- son: 2026-11-14T22:16:15.379Z
- gorulme: 3
- sayfa: performans-calisma-alanim
- senaryo: Çalışma alanım > İşlerim: Tümü'nde başlığa bak; Bu hafta ve Bu ay'a bas.
- beklenen: Başlık sayısı, grup sayaçlarının toplamı ve listedeki satırlar eşit olmalı; Bu ay'da Aralık işleri elenmeli.
- gozlenen: Başlıkta "7 açık iş", Geciken 5 + Yakında 5 = 10. Bu ay seçilince "Bu ay · 5 iş" altında "Diğer işlerim" ile Aralık (ARA 1, 25 gün kaldı) ve EKİ işleri hâlâ listeleniyor; sayaçlar Geciken 1 / Yakında 4'e dönüyor.
- alinti: 7 açık iş

## yz:isler-kalan-gun-tarihle-celisiyor
- baslik: 1 Aralık tarihli işlerde "26 gün kaldı", 5 Aralık tarihli işte "21 gün kaldı" yazıyor
- tur: tutarsizlik
- sayfalar: performans-calisma-alanim
- ilk: 2026-11-13T21:04:18.752Z
- son: 2026-11-14T22:15:53.230Z
- gorulme: 3
- sayfa: performans-calisma-alanim
- senaryo: Çalışma alanım > İşlerim > Tümü; ARA 1 satırlarına bak (bugün 15 Kasım 2026)
- beklenen: 1 Aralık için 16 gün kaldı
- gozlenen: Rozet ARA 1 ama "25 gün kaldı" yazıyor; KAS 17 için 2 gün kaldı doğru olduğundan çelişiyor
- alinti: 25 gün kaldı

## yz:karne-ceyrek-dugmesi-ay-suzgecinde-tepkisiz
- baslik: Ocak süzgeci açıkken 3. çeyrek "—" görünüyor ve tıklanınca tepki vermiyor
- tur: tutarsizlik
- sayfalar: performans-karne
- ilk: 2026-11-13T21:13:13.881Z
- son: 2026-11-13T21:13:13.881Z
- gorulme: 1
- sayfa: performans-karne
- senaryo: 1) Firma karnesini aç (Dönem: Tüm yıl). 2) Grafikte Ocak çubuğuna tıkla. 3) Çeyrek şeridinde "3. çeyrek —" düğmesine tıkla.
- beklenen: 3. çeyreğin puanı gösterilmeli (tüm yıl görünümünde 100,6). Tıklanınca dönem 3. çeyreğe geçmeli, sayaçlar ve tablolar ona göre değişmeli.
- gozlenen: Ocak süzgecinde 2. ve 3. çeyrek "—" (veri yok gibi) görünüyor. Oysa tüm yıl görünümünde 2. çeyrek 98,5, 3. çeyrek 100,6 ve grafikte bu ayların verisi var. 3. çeyrek düğmesine tıklanınca adres (period_key=2026-01), Dönem "Ocak 2026" ve sayaçlar değişmedi. Bu bir kez denendi.
- alinti: 3. çeyrek

## yz:karne-gecikme-geciken-veri-girisi-ad-farki
- baslik: "Geciken veri girişi" tabloda "Gecikme", listede "Gecikti" diye geçiyor
- tur: tutarsizlik
- sayfalar: performans-karne
- ilk: 2026-11-13T20:33:24.809Z
- son: 2026-11-13T20:33:24.809Z
- gorulme: 1
- sayfa: performans-karne
- senaryo: Performans karnesini aç. Göstergeler panelindeki "Geciken veri girişi" ipucunu, Departman ve süreç karneleri tablosundaki "Gecikme" sütununun ipucuyla karşılaştır.
- beklenen: Tanımı aynı olan kavram aynı adla gösterilmeli.
- gozlenen: İki ipucunun tanımı birebir aynı: "Son tarihi geçtiği halde verisi girilmemiş ölçüm sayısıdır." Buna rağmen panelde "Geciken veri girişi", tabloda "Gecikme" adı kullanılıyor. Dikkat gerektirenler bölümündeki durum etiketi ise "Gecikti".
- alinti: Gecikme

## yz:karne-kirmizi-hedefin-gerisinde-ad-farki
- baslik: "Hedefin gerisinde" kavramı karne tablosunda "Kırmızı" diye geçiyor
- tur: tutarsizlik
- sayfalar: performans-dif-ac, performans-karne
- ilk: 2026-11-13T20:33:24.746Z
- son: 2026-11-13T21:05:43.968Z
- gorulme: 2
- sayfa: performans-dif-ac
- senaryo: Yeni DİF talebi sayfasını açın, PLN-2026-01 planını seçin, GST-0010 Oca %75,0 hücresine tıklayın; sağ paneldeki Ölçüm bölümüne bakın.
- beklenen: Sayfa açıklamasındaki "Hedefin gerisinde" ifadesi sonuç etiketinde ve yardım metinlerinde de aynen kullanılmalı.
- gozlenen: Sayfa açıklaması "Hedefin gerisinde kalan bir ölçüm" diyor. Aynı sayfada Plan yardım metninde "kırmızı ölçümü olan", Sapma dönemi açıklamasında "sonucu kırmızı çıkan" yazıyor. Bağlam panelinde de "Sonuç: Kırmızı" görünüyor. Kilit ipuçlarında ise "sınırda (sarı)", "hedefte (yeşil)" ifadeleri var.
- alinti: Sonuç: Kırmızı

## yz:karne-onayli-olcum-sayisi-celiskili
- baslik: Onaylı ölçüm 118/120, grafikteki ölçüm sayıları ve 33 geciken veri girişiyle çelişiyor
- tur: tutarsizlik
- sayfalar: performans-karne
- ilk: 2026-11-13T20:33:24.680Z
- son: 2026-11-13T20:33:24.680Z
- gorulme: 1
- sayfa: performans-karne
- senaryo: Performans karnesi sayfasını Dönem: Tüm yıl ile aç. Göstergeler panelinde Onaylı ölçüm ve Geciken veri girişi değerlerini, Aylık şirket puanı grafiğinde ayların altındaki x/15 sayılarını karşılaştır.
- beklenen: Beklenen ölçüm sayısı grafikle tutmalı. 9 ay × 15 gösterge = 135 ölçüm beklenir. Ağustosta 2, Eylülde 13 ölçüm eksik olduğundan onaylı oran en çok 120/135 olmalı. Geciken 33 ölçüm varsa beklenen ölçümlerin büyük kısmının onaylı olduğu gösterilmemeli.
- gozlenen: Onaylı ölçüm 118 / 120 gösteriliyor, yani yalnızca 2 ölçüm eksik. Oysa grafikte Ağu 13/15 ve Eyl 2/15 görünüyor, bu iki ayda toplam 15 ölçüm eksik. Payda 120, beklenen değil girilmiş ölçüm sayısına denk geliyor (7×15+13+2=120). Aynı panelde Geciken veri girişi 33. Tanıma göre bu, son tarihi geçmiş ama verisi girilmemiş ölçüm sayısı. Yani 120 beklenen ölçümden yalnızca 2'si eksikken 33 ölçümün gecikmiş olması mümkün değil.
- alinti: 118 / 120

## yz:onaylarim-yonlendirme-suzgec-uygulanmiyor
- baslik: Onaylarım yönlendirmesi (?cip=onay) listeyi onay işlerine süzmüyor
- tur: tutarsizlik
- sayfalar: performans-onaylarim
- ilk: 2026-11-13T21:14:35.993Z
- son: 2026-11-13T21:14:35.993Z
- gorulme: 1
- sayfa: performans-onaylarim
- senaryo: 1) /performans-onaylarim adresini aç. 2) Sayfa /performans-calisma-alanim?cip=onay adresine yönlenir. 3) İşlerim listesine bak.
- beklenen: Onaylarım sayfası ya da yalnız onay işlerini gösteren süzülmüş bir liste; başlık/ekmek kırıntısı onaylara işaret etmeli.
- gozlenen: Başlık ve ekmek kırıntısı "Çalışma alanım" kalıyor, "Tümü" süzgeci seçili; listede veri girişi (Ölçüm gir) ve plan düzeltme (Düzelt) işleri de görünüyor. cip=onay parametresi yönlendirmenin amacıyla çelişiyor, hiçbir etkisi yok.
- alinti: Ölçüm gir

## yz:performans-gosterge-adres-farki
- baslik: Görev adresi /performans-gosterge yok; menüdeki adres /performans-gostergeler
- tur: kesin
- sayfalar: performans-gosterge
- ilk: 2026-11-13T21:09:10.605Z
- son: 2026-11-14T10:38:25.417Z
- gorulme: 2
- sayfa: performans-gosterge
- senaryo: 1. https://glomil.zeyrek.app/dev/qm/web/performans-gosterge adresini aç.
- beklenen: Performans göstergeleri sayfası açılır.
- gozlenen: Adres /sayfa-bulunamadi'ya yönleniyor ve 'Aradığınız sayfa bulunamadı' yazıyor. Menüdeki adres /performans-gostergeler olduğu için bu bilinen adres farkıyla aynı kök neden.
- alinti: Aradığınız sayfa bulunamadı

## yz:performans-olcum-sayfasi-menude-yok
- baslik: /performans-olcum adresi "sayfa bulunamadı"ya gidiyor, menüde ölçüm/veri girişi sayfası yok
- tur: kesin
- sayfalar: performans-olcum
- ilk: 2026-11-13T21:14:02.812Z
- son: 2026-11-14T10:39:01.213Z
- gorulme: 2
- sayfa: performans-olcum
- senaryo: https://glomil.zeyrek.app/dev/qm/web/performans-olcum adresini aç.
- beklenen: Performans ölçüm/veri girişi sayfası açılır.
- gozlenen: Adres /sayfa-bulunamadi'ya yönleniyor; "Aradığınız sayfa bulunamadı" mesajı görünüyor.
- alinti: Aradığınız sayfa bulunamadı

## yz:revizyon-yeni-talep-sayfa-adi-farki
- baslik: Yeni revizyon sayfası üç farklı adla anılıyor
- tur: tutarsizlik
- sayfalar: performans-hedef-revizyonlari, performans-hedef-revizyonu
- ilk: 2026-11-13T21:10:58.417Z
- son: 2026-11-13T21:12:13.849Z
- gorulme: 2
- sayfa: performans-hedef-revizyonu
- senaryo: performans-hedef-revizyonu sayfasını aç; gezinti yolundaki son öğeye ve sayfa başlığına bak.
- beklenen: Sayfa her yerde aynı adla anılmalı.
- gozlenen: Gezinti yolunda "Yeni talep", H1 başlıkta "Yeni hedef revizyonu" yazıyor. Tarayıcı sekme başlığı araçla görülemediği için doğrulanamadı.
- alinti: Yeni talep

## yz:sablon-ornegi-sekme-adi-ek
- baslik: Sekme adında tamlama eki eksik: 'DOKÜMAN ŞABLON ÖRNEĞİ'
- tur: tutarsizlik
- sayfalar: dokuman-sablonlari
- ilk: 2026-11-14T07:37:40.905Z
- son: 2026-11-14T07:37:40.905Z
- gorulme: 1
- sayfa: dokuman-sablonlari
- senaryo: Yeni doküman şablonu formunu aç; alt bölümdeki sekme adlarına bak.
- beklenen: Sayfanın geri kalanındaki adlandırmayla uyumlu olarak 'DOKÜMAN ŞABLONU ÖRNEĞİ'.
- gozlenen: Sayfa başlığı 'Doküman şablonu' ve düğme 'Doküman şablonu oluştur' iyelik ekiyle yazılmış. Sekme ise eksiz 'DOKÜMAN ŞABLON ÖRNEĞİ' olarak yazılmış.
- alinti: DOKÜMAN ŞABLON ÖRNEĞİ

## yz:sablon-sayfa-aciklamasi-yazim
- baslik: Sayfa açıklamasında dil bilgisi hatası: 'doküman şablonlarını ayarlarını'
- tur: kesin
- sayfalar: dokuman-sablonlari
- ilk: 2026-11-14T07:37:40.855Z
- son: 2026-11-14T07:37:40.855Z
- gorulme: 1
- sayfa: dokuman-sablonlari
- senaryo: Doküman şablonları listesinde 'Yeni doküman şablonu' düğmesine tıkla; başlığın altındaki açıklamayı oku.
- beklenen: 'Aşağıdan doküman şablonu ayarlarını görüntüleyebilir…' ya da 'doküman şablonlarının ayarlarını'.
- gozlenen: Açıklamada iki belirtme eki art arda geliyor: 'doküman şablonlarını ayarlarını görüntüleyebilir'. Cümle Türkçe dil bilgisine uymuyor.
- alinti: doküman şablonlarını ayarlarını

## yz:sayi-filtresi-yer-tutucu-kesik
- baslik: Hedef, Gösterge ve Puan sayı filtrelerinde yer tutucu kesik ("En ‹")
- tur: kesin
- sayfalar: performans-planlar
- ilk: 2026-11-14T15:04:25.350Z
- son: 2026-11-14T15:04:25.350Z
- gorulme: 1
- sayfa: performans-planlar
- senaryo: Performans planları sayfasını aç; Hedef, Gösterge, Puan başlık altındaki filtre kutularına bak.
- beklenen: Yer tutucu (ör. En az / En çok) kutuya sığar, tam okunur.
- gozlenen: Kutularda yalnızca "En ‹" şeklinde kesik metin görünüyor.
- alinti: En

## yz:veri-etiketi-pozisyon-ek
- baslik: Veri etiketi adlarında iyelik eki eksik: 'Hazırlayan pozisyon'
- tur: tutarsizlik
- sayfalar: dokuman-sablonlari
- ilk: 2026-11-14T07:37:40.954Z
- son: 2026-11-14T07:37:40.954Z
- gorulme: 1
- sayfa: dokuman-sablonlari
- senaryo: Yeni doküman şablonu formunu aç; 'VERİ ETİKETLERİ' sekmesinde 'Hazırlama ve onay' grubuna bak.
- beklenen: 'Hazırlayan pozisyonu', 'Son onaycı pozisyonu'.
- gozlenen: Aynı grupta 'Hazırlayan adı soyadı' ve 'Kontrol eden adı soyadı' iyelik ekiyle yazılmış. 'Hazırlayan pozisyon' ve 'Son onaycı pozisyon' ise eksiz kalmış.
- alinti: Hazırlayan pozisyon
