---
sayfa: performans-donemler
yazar: krtbu
guncelleme: 2026-11-15T07:26:17.547Z
kosu: KOS-2026-0035
iz_arayuz: 9019d4fee82bfd20
iz_veri: d0289e27acac3008
iz_studio: ff1d4536f47416f7
---

## Amaç
Performans yönetimi modülünde değerlendirme dönemlerini ad/kod, form şablonu, plan, aşama, kayıt sayısı ve tarihlerle listeler. Durum sekmeleri, filtreler, dönem detayı ve 'Yeni dönem' oluşturma sihirbazına geçiş sunar.

## Ekranlar
- Liste (varsayılan Tümü): Tümü/Aktif/Taslak/Kapandı sekmeleri ve rozetleri, kolon filtreleri, gelişmiş filtre, kolonlar menüsü, Yenile, 'Yeni dönem' düğmesi.
- Aktif sekmesi: rozete tıklanınca açılır, '1–3 / 3 kayıt' biçiminde sayfalama gösterir.
- Kapandı sekmesi: kapanmış dönemler listelenir, aşama etiketi 'Kapandı' olur.
- Dönem detayı (performans-donem?id=): aktif satıra tıklanınca açılır; aşama şeridi, ilerleme 'x / 6 tamamlandı', katılımcı sayaçları, kapsam ve form şablonu özeti içerir.
- Detayda 'Diğer işlemler' menüsü: tek seçenek 'Kalibrasyon oturumları'.
- Yeni dönem sayfası (performans-donem-olustur): pencere değil ayrı sayfadır; 3 adımlı sihirbaz ve 6 aşamalı takvim içerir, ilk açılışta yükleme göstergesi görünür.
- Form şablonu ve Bağlı performans planı açılır listeleri: 'Ara' kutulu seçenek listesi.
- Aşama tarih alanlarında takvim açılır penceresi: Türkçe gün kısaltmaları kullanılır, alttaki alanların üstünü örter.
- Yeni dönem formundan çıkarken tarayıcı onayı çıkar: 'Girilen bilgiler kaydedilmedi. Sayfadan çıkılsın mı?'.

## Beklentiler
- Tümü rozeti Aktif + Taslak + Kapandı toplamına eşit olmalı; her sekmenin rozeti süzülen satır sayısıyla tutmalı. (güven: yüksek)
- Listedeki Kayıt değeri detaydaki 'Katılımcılar' sayısı ve katılımcı tablosu toplamıyla aynı olmalı. (güven: yüksek)
- Detayda 'Tümü' sayacı, durum alt sayaçlarının toplamına (Hedef belirlemede, Öz değerlendirmede, Hedef onayında…) eşit olmalı. (güven: yüksek)
- Aşamalar 6 adımdır ve form takvimi ile detay şeridinde aynı adlarla aynı sırada geçmelidir: Hedef belirleme, Öz değerlendirme, Yönetici değerlendirmesi, Kalibrasyon, Sonuç yayını, İtiraz süresi. (güven: yüksek)
- Tarihler sayfa genelinde '15 Şub 2027' biçiminde gösterilmeli; aynı ekranda ikinci bir biçim olmamalı. (güven: yüksek)
- Dönem adı, dönem kodu yılı, bağlı plan kodu yılı ve tarih aralığı birbiriyle tutarlı olmalı; mevcut çelişkiler açık sorundur. (güven: orta)
- Yeni dönem formunda Dönem adı, Form şablonu ve Hedef belirleme zorunludur; 'Sıradaki' düğmesine basınca 'Bu alan zorunludur.' çıkar. (güven: orta)
- Aşama tarihleri ardışık olmalı; önceki aşamadan erken tarih 'Tarih, bir önceki aşamanın tarihinden önce olamaz.' ile reddedilir (bu uyarı alan seçilirken değil, gönderimde çıkar). (güven: orta)
- E-posta gönderimi kapalıyken hatırlatma alanları devre dışı olmalı; bu açık sorundur. (güven: orta)
- Açılır seçenekler Türkçe ve tutarlı sırada olmalı; şablonlar doğru sıralanıyor, plan listesinin sırası açık sorundur. (güven: orta)
- Detaydaki aşama ilerletme tek bir düğmeyle yalnız sıradaki aşamaya geçirir; ayrı bir kalibrasyon düğmesi yoktur. (güven: orta)
- Tamamlanmış görünen aşamada katılımcı kalmamalı; 'Yöneticisi eksik' sayacı katılımcı listesiyle çelişmemeli. (güven: düşük)
- Kapanmış dönemlerin Başlangıç ve Bitiş tarihleri dolu olmalı. (güven: düşük)

## Kapsanan
- Tümü, Aktif ve Kapandı sekme rozetleri ile Aktif sekmesinin satır sayısı.
- İki aktif dönemin detayı: aşama şeridi, ilerleme, katılımcı sayaçları, kapsam ve şablon özeti.
- Detaydaki 'Diğer işlemler' menüsü ve aşama ilerletme düğmesinin metni.
- Kalibrasyonun yeri: 6 aşamanın 4.'sü; formda yalnız isteğe bağlı bir tarih alanı.
- Yeni dönem formunun açılması, alanları, adımları ve ilerleme göstergesi.
- Form şablonu açılır listesi: seçenekler ve sıralama.
- Bağlı performans planı açılır listesi: 17 seçenek, biçim ve sıra.
- Tarih seçici: gün kısaltmaları, önceki ay günü seçimi, temizleme düğmesi.
- Zorunlu alan doğrulaması ve aşama tarih sırası doğrulaması.
- E-posta kapalıyken hatırlatma alanlarının durumu.
- Gezinti yolu, sekme başlığı ve sayfa adları (liste, detay, oluşturma).

## Kapsanmayan
- Taslak sekmesi ve sekmelerde aşama etiketlerinin hangi sekmeye düştüğü.
- Kolon filtreleri (dönem, şablon, plan, aşama, kayıt, tarih), operatör menüsü ve boş durum mesajı.
- Tüm kolonlarda artan/azalan sıralama: Türkçe alfabe, tarih ve Kayıt'ın sayısal sıralaması.
- Gelişmiş filtre paneli: alan adlarının kolonlarla karşılaştırılması (İlerleme açık sorununun yeniden kontrolü).
- Kolonlar menüsü, kolon gizleme/açma, Yenile sonrası durum ve kolon genişliği/taşma.
- Sayfalama, sayfa boyutu ve liste sonu.
- Kapanmış dönem detayı ve aşama geçmişindeki kalibrasyon izi; ayrıca Kalibrasyon oturumları sayfası.
- Kalibrasyon aşamasının atlanabilirliği (aşama geçiş düğmesi engelli).

## Tuhaflıklar
- Yeni dönem formunda bir alana dokunulduktan sonra (alan sonra boşaltılsa bile) çıkışta onay çıkar ve kontrolcü onayı iptal eder; bastan_ac de ERR_ABORTED verir. Bu koşuda 4–9. görevler bu yüzden kilitlendi. Formu en son 
- Aktif satırlar detaya açılıyor, ama Kapandı sekmesindeki satır/ad/hücre tıklamaları 'yazma işi yapabilir' diye sistemce engelleniyor.
- Aşama geçiş düğmeleri ve kayıt sistemce engelli; ilerletme davranışı test edilemez, bu durum bulgu değildir.
- Bu koşuda 'Seçenekler yüklenemedi' ve 'ServiceUnavailable' görülmedi; sorunlar aralıklı olabilir, yeniden kontrol edilmeli.
- Liste, detay ve Yeni dönem sayfası ilk açılışta yalnız yükleme göstergesi gösterir; içerik gelene kadar bekle.
- Detaydaki katılımcı tablosunda 'Puan' sütunu sağda kesik görünüyor; yatay kaydırmadan kaynaklanıyor olabilir.
- Sayfa adları ekrana göre değişiyor: listede 'Dönem yönetimi', detayda 'Değerlendirme dönemi', oluşturmada 'Yeni değerlendirme dönemi'.
- Kalibrasyonu açıp kapatan bir anahtar ya da zorunluluk ayarı yok; formda yalnız isteğe bağlı bir tarih alanı olarak geçiyor.
