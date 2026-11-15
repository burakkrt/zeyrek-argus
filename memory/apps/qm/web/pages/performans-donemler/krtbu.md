---
sayfa: performans-donemler
yazar: krtbu
guncelleme: 2026-11-15T08:41:12.261Z
kosu: KOS-2026-0038
iz_arayuz: 9019d4fee82bfd20
iz_veri: 6ff588656460d5ae
iz_studio: ff1d4536f47416f7
---

## Amaç
Performans modülünde değerlendirme dönemlerini ad/kod, form şablonu, plan, aşama, kayıt sayısı ve tarihlerle listeler. Durum sekmeleri, kolon ve gelişmiş filtreler, dönem detayına geçiş ve 'Yeni dönem' sihirbazı sunar.

## Ekranlar
- Liste (varsayılan Tümü): Tümü/Aktif/Taslak/Kapandı sekmeleri ve rozetleri, kolon filtreleri, gelişmiş filtre, kolonlar menüsü, Yenile ve 'Yeni dönem' düğmesi bulunur.
- Aktif sekmesi rozete tıklanınca açılır ve '1–3 / 3 kayıt' biçiminde sayfalama gösterir; varsayılan sayfa boyutu 20'dir.
- Kapandı sekmesi kapanmış dönemleri 'Kapandı' etiketiyle listeler; bu dönemlerde Plan hücresi '—' gösterir.
- Filtre sonucu boşsa 'Eşleşen kayıt bulunamadı' mesajı, 'n filtre uygulandı' açıklaması ve 'Filtreleri temizle' düğmesi çıkar.
- Dönem detayı (performans-donem?id=) aktif satıra tıklanınca açılır; aşama şeridi, 'x / 6 tamamlandı' ilerlemesi, katılımcı sayaçları ve şablon özeti içerir.
- Detaydaki 'Diğer işlemler' menüsünde 'Kalibrasyon oturumları' seçeneği vardır ve performans-kalibrasyonlar sayfasını yeni sekmede açar.
- Yeni dönem (performans-donem-olustur) pencere değil ayrı bir sayfadır; 3 adımlı sihirbaz ve 6 aşamalı takvim içerir.
- Form şablonu ve Bağlı performans planı alanları 'Ara' kutulu açılır listelerdir.
- Aşama tarih alanlarında Türkçe takvim açılır penceresi çıkar ve alttaki alanların üstünü örter.
- Yeni dönem formundan çıkarken 'Girilen bilgiler kaydedilmedi. Sayfadan çıkılsın mı?' onayı çıkar.

## Beklentiler
- Tümü rozeti Aktif + Taslak + Kapandı toplamına eşit olmalı; her sekmenin rozeti o sekmede süzülen satır sayısıyla tutmalı. (güven: yüksek)
- Listedeki Kayıt değeri, detaydaki 'Katılımcılar' sayısıyla ve katılımcı tablosunun toplamıyla aynı olmalı. (güven: yüksek)
- Detaydaki 'Tümü' sayacı, durum alt sayaçlarının toplamına eşit olmalı. (güven: yüksek)
- Aşamalar 6 adımdır (Hedef belirleme, Öz değerlendirme, Yönetici değerlendirmesi, Kalibrasyon, Sonuç yayını, İtiraz süresi); formda ve detay şeridinde aynı ad ve sırayla geçmeli. (güven: yüksek)
- Tarihler sayfa genelinde '15 Şub 2027' biçiminde gösterilmeli; aynı ekranda ikinci bir biçim olmamalı. (güven: yüksek)
- Boş durum metnindeki filtre sayısı, 'Gelişmiş filtre' düğmesindeki sayaçla tutmalı. (güven: orta)
- Tüm metin ve sayı kolon filtrelerinde yer tutucu bulunmalı; Plan ve Kayıt filtrelerinin boş yer tutucusu açık sorundur. (güven: yüksek)
- Dönem adı, dönem kodu yılı, plan kodu yılı ve tarih aralığı birbiriyle tutarlı olmalı; mevcut çelişkiler açık sorundur. (güven: orta)
- Yeni dönem formunda Dönem adı, Form şablonu ve Hedef belirleme zorunludur; boş geçilince 'Bu alan zorunludur.' çıkar. (güven: orta)
- Aşama tarihleri ardışık olmalı; daha erken tarih gönderimde 'Tarih, bir önceki aşamanın tarihinden önce olamaz.' uyarısıyla reddedilir. (güven: orta)
- E-posta kapalıyken hatırlatma alanları devre dışı olmalı; şu an etkin olmaları açık sorundur. (güven: orta)
- Açılır seçenekler Türkçe ve tutarlı sırada olmalı; şablon listesi doğru sıralı, plan listesinin sırası açık sorundur. (güven: orta)
- Aşama ilerletme tek düğmeyle yalnız sıradaki aşamaya geçirir (pf-donem-islem advance); tanımda kalibrasyon oturumu yayın için ön şart değildir. (güven: düşük)
- Tanıma göre oturumsuz yayında puan olarak ham toplam (total_score_e2) kullanılır ve bunu bildiren bir uyarı yoktur (pf-donem-islem pub). (güven: düşük)
- Kapanmış dönemlerin Başlangıç ve Bitiş tarihleri dolu olmalı; tamamlanmış aşamada katılımcı kalmamalı. (güven: düşük)

## Kapsanan
- Tümü, Aktif ve Kapandı sekme rozetleri ve Aktif sekmesinin satır sayısı; iki kez doğrulandı.
- Aşama kolon filtresi: 'Kalibrasyon' araması, boş durum mesajı, filtre çipi ve 'Filtreleri temizle' düğmesi.
- Kolon filtrelerinin yer tutucuları denendi; Plan ve Kayıt filtrelerinde yer tutucu eksik.
- İki aktif dönemin detayı: aşama şeridi, ilerleme, katılımcı sayaçları, kapsam ve şablon özeti.
- Detaydaki 'Diğer işlemler' menüsü ve aşama ilerletme düğmesinin metni.
- Kalibrasyon akışının tanımı: yayın ve geçiş adımları, oturum sayfalarının yeri (salt tanımdan).
- Yeni dönem formu: alanlar, adımlar ve ilerleme göstergesi.
- Form şablonu ve Bağlı performans planı açılır listeleri: seçenekler ve sıralama.
- Tarih seçici: gün kısaltmaları, önceki ay günü seçimi ve temizleme.
- Zorunlu alan ve aşama tarih sırası doğrulaması.
- E-posta kapalıyken hatırlatma alanlarının durumu.
- Gezinti yolu, sekme başlığı ve sayfa adları.

## Kapsanmayan
- Taslak sekmesi ve aşama etiketlerinin hangi sekmeye düştüğü.
- Aşama dışındaki kolon filtreleri (dönem, şablon, plan, kayıt, tarih) ve operatör menüsü.
- Tüm kolonlarda artan/azalan sıralama: Türkçe alfabe, tarih ve Kayıt'ın sayısal sırası.
- Gelişmiş filtre paneli: alan adlarının kolonlarla karşılaştırılması ve İlerleme sorununun yeniden kontrolü.
- Kolonlar menüsü, kolon gizleme/açma, Yenile sonrası durum ve taşma.
- Sayfalama, sayfa boyutu değişimi ve liste sonu.
- Sonuç yayını aşamasındaki dönemin detayı: 'Kalibrasyon oturumları' seçeneğinin görünürlüğü (hasCalibration) ve aşama geçmişindeki kalibrasyon izi.
- Kalibrasyon oturumları sayfası (performans-kalibrasyonlar) ve oturum detayı.

## Tuhaflıklar
- Yeni dönem formunda bir alana dokunulduktan sonra çıkış onayı çıkar ve kontrolcü onayı iptal eder; bastan_ac de ERR_ABORTED verir, bu yüzden formu en sona bırak.
- Aktif satırlar detaya açılır, ama Kapandı sekmesindeki satır tıklamaları 'yazma işi yapabilir' diye sistemce engellenir.
- Aşama geçiş düğmeleri ve kayıt sistemce engellidir; ilerletme ve yayın test edilemez ve bu bulgu değildir.
- Ortamda Kalibrasyon aşamasında dönem yok, aşama filtresi 0 kayıt döndürüyor; bu veri eksikliğidir, test edilemedi notu olarak ele alınır.
- Kolon filtresi uygulanınca sekme rozetleri değişmez, yalnız listedeki kayıt sayısı değişir.
- Liste, detay ve Yeni dönem sayfası ilk açılışta yalnız yükleme göstergesi gösterir; içerik gelene kadar beklenmeli.
- Filtre operatörü ağaçta 'İçerir' (≈) olarak geçer, görüntüde farklı bir simge gibi görünebilir.
- Sayfa adı ekrana göre değişir: listede 'Dönem yönetimi', detayda 'Değerlendirme dönemi', oluşturmada 'Yeni değerlendirme dönemi'.
