---
sayfa: performans-donemler
yazar: krtbu
guncelleme: 2026-11-15T10:04:08.039Z
kosu: KOS-2026-0041
iz_arayuz: 9019d4fee82bfd20
iz_veri: 6ff588656460d5ae
iz_studio: ff1d4536f47416f7
---

## Amaç
Performans modülündeki değerlendirme dönemlerini ad, kod, form şablonu, plan, aşama, kayıt sayısı ve tarihlerle listeler. Sayfada durum sekmeleri, kolon ve gelişmiş filtreler, dönem detayına geçiş ve 'Yeni dönem' sihirbazı var.

## Ekranlar
- Liste Tümü sekmesinde açılır: Tümü/Aktif/Taslak/Kapandı sekmeleri ve rozetleri, kolon filtreleri, gelişmiş filtre, kolonlar menüsü, Yenile ve 'Yeni dönem' düğmesi var.
- Aktif sekmesi rozete tıklanınca açılır, '1–3 / 3 kayıt' biçiminde sayfalama gösterir; sayfa başına varsayılan 20 kayıttır.
- Kapandı sekmesi kapanmış dönemleri 'Kapandı' etiketiyle listeler; Plan hücresi dolu olabilir (ör. eski yıl sonu dönemlerinde bir plan kodu).
- Filtre sonucu boşsa 'Eşleşen kayıt bulunamadı', 'n filtre uygulandı' metni ve 'Filtreleri temizle' düğmesi çıkar.
- Aktif satıra tıklayınca dönem detayı (performans-donem?id=) açılır: aşama şeridi, 'x / 6 tamamlandı', katılımcı ve durum sayaçları, kapsam, şablon özeti, aşama açıklaması, ilerletme düğmesi ve katılımcı tablosu (Çalışan,
- Detaydaki 'Diğer işlemler' menüsünün tek seçeneği 'Kalibrasyon oturumları'; bu seçenek ve aşama açıklamasındaki bağlantı performans-kalibrasyonlar sayfasını yeni sekmede açar.
- 'Yeni dönem' pencere açmaz, ayrı bir sayfaya (performans-donem-olustur) gider: 3 adımlı sihirbaz ve 6 aşamalı takvim içerir.
- Form şablonu ve Bağlı performans planı, 'Ara' kutulu açılır listelerdir.
- Aşama tarih alanlarında Türkçe takvim açılır ve alttaki alanların üstünü örter.
- Yeni dönem formundan çıkarken 'Girilen bilgiler kaydedilmedi. Sayfadan çıkılsın mı?' onayı çıkar.

## Beklentiler
- Tümü rozeti Aktif + Taslak + Kapandı toplamına eşit olmalı; her sekmenin rozeti o sekmedeki satır sayısıyla ve sayfalama toplamıyla tutmalı. (güven: yüksek)
- Listedeki Kayıt değeri, detaydaki 'Katılımcılar' sayacıyla ve katılımcı tablosunun toplamıyla aynı olmalı. (güven: yüksek)
- Detaydaki 'Tümü' durum sayacı, durum alt sayaçlarının toplamına eşit olmalı. (güven: yüksek)
- Aşama etiketleri listede, formda ve detay şeridinde aynı ad ve sırayla geçmeli. (güven: yüksek)
- Tarihler liste ve detayda tek biçimde gösterilmeli ('15 Şub 2027', '1 Eki – 31 Eki 2026'). (güven: yüksek)
- Her metin ve sayı kolon filtresinde yer tutucu olmalı; Plan ve Kayıt filtrelerinde yer tutucu olmaması açık sorun. (güven: yüksek)
- Dönem adı, dönem kodundaki yıl, plan kodundaki yıl ve tarih aralığı birbiriyle tutarlı olmalı; iki aktif dönem aynı plan kodunu taşımamalı. (güven: yüksek)
- Henüz başlamamış dönem Aktif listesinde ileri aşamada ya da Kapandı durumunda görünmemeli; kapanmış dönemin Başlangıç ve Bitiş tarihleri dolu olmalı. (güven: yüksek)
- Bitiş tarihi bugünden ileride olan aşama şeritte tamamlanmış görünmemeli; tamamlanmış aşamada katılımcı kalmamalı. (güven: yüksek)
- 'Yöneticisi eksik' sayacı katılımcı sayısını aşmamalı ve katılımcı listesiyle tutmalı. (güven: yüksek)
- Detaydaki şablon ağırlıklarının (Hedefler, Yetkinlikler, 360°) toplamı %100 olmalı. (güven: yüksek)
- Kesme işareti sayfa boyunca tek biçimde kullanılmalı; detayda ’ ile ' karışık kullanılması bildirildi (yz:donem-detay-kesme-isareti-tutarsiz). (güven: yüksek)
- Yeni dönem formunda Dönem adı, Form şablonu ve Hedef belirleme zorunlu olmalı; aşama tarihleri ardışık olmalı ve önceki aşamadan erken bir tarih uyarıyla reddedilmeli. (güven: orta)
- E-posta kapalıyken hatırlatma alanları devre dışı olmalı; açılır seçenekler tutarlı bir sırada olmalı. (güven: orta)
- Tanıma göre (pf-donem-islem val/pub) ilerletmeyi yalnız açık (Open) kalibrasyon oturumu engelliyor; oturum yoksa ham puan yayınlanıyor ve detayda bunu bildiren uyarı yok (açık sorun). (güven: orta)

## Kapsanan
- Tümü, Aktif ve Kapandı rozetleri ile Aktif sekmesindeki satır sayısı ve sayfalama (birçok koşuda tutarlı).
- Aşama etiketleri; tanım, liste ve detay şeridiyle karşılaştırıldı, tutarlı.
- Aşama kolon filtresi: arama, boş durum, filtre çipi ve 'Filtreleri temizle'.
- Kolon filtrelerinin yer tutucuları (Plan ve Kayıt filtrelerinde eksik).
- Sonuç yayınındaki dönemin detayı: şerit, sayaçlar, kapsam, şablon özeti, ilerletme düğmesi ve aşama açıklaması (iki koşuda doğrulandı).
- Liste Kayıt değeri, detaydaki Katılımcılar sayacı ve durum sayaçlarının toplamı (tutuyor).
- Satırların ad, kod, plan ve tarih tutarlılığı; Aktif ve Kapandı satırlarındaki yıl çelişkileri.
- 'Diğer işlemler' menüsü ve 'Kalibrasyon oturumları' bağlantıları.
- pf-donem-islem ve pf-kalibrasyon-islem tanımları: advance, pub, publishRest, create, save ve close kuralları.
- Yeni dönem formu: alanlar, adımlar, açılır listeler, tarih seçici, zorunlu alanlar ve tarih sırası doğrulaması.
- E-posta kapalıyken hatırlatma alanlarının durumu.
- Gezinti yolu, sekme başlığı ve sayfa adları.

## Kapsanmayan
- Taslak sekmesi ile taslak dönemlerin satırları ve aşama etiketleri.
- Aşama dışındaki kolon filtreleri (dönem, şablon, plan, kayıt, tarih) ve operatör menüsü.
- Tüm kolonlarda artan/azalan sıralama: Türkçe alfabe, tarih sırası ve Kayıt'ın sayısal sırası.
- Gelişmiş filtre paneli: alan adlarının kolon adlarıyla karşılaştırılması.
- Kolonlar menüsü, kolon gizleme, Yenile sonrası durum ve sayfa boyutu değişimi.
- Detaydaki katılımcı tablosunun filtre ve sıralaması; durum sayacına tıklayınca tablonun süzülüp süzülmediği.
- performans-kalibrasyonlar sayfası ve Sonuç yayınındaki dönemde açık oturum olup olmadığı.
- Detay kapsamındaki 'En az kıdem … (31 Ara 2026'ya göre)' baz tarihinin dönem bitişinden sonra olması; tanımdan kontrol edilmeli.

## Tuhaflıklar
- Yeni dönem formunda bir alana dokunulduktan sonra çıkış onayı çıkıyor ve bastan_ac ERR_ABORTED veriyor; form en sona bırakılmalı.
- Kapandı satırlarına tıklama 'yazma işi yapabilir' diye engelleniyor; aktif satırlar detaya açılıyor.
- Aşama ilerletme, yayın, oturum açma ve kayıt düğmeleri sistemce engelli; davranışları tanımdan çıkarılır, bulgu değildir.
- Ortamda Kalibrasyon aşamasında dönem yok; o aşamaya özgü düğme ve uyarı 'test edilemedi' notu olarak düşülür.
- Kolon filtresi uygulanınca sekme rozetleri değişmiyor, yalnız listedeki kayıt sayısı değişiyor.
- Liste, detay ve Yeni dönem sayfası ilk açılışta yalnız yükleme simgesi gösteriyor ve ağaçta önceki başlık kalıyor; yargılamadan önce beklenmeli.
- Sonuç yayınındaki dönemde 'Kalibrasyonda n' katılımcı görünmesi, aşama açıklamasındaki 'açık oturum kapatılınca yayınlanabilir' cümlesiyle açıklanıyor.
- Sayfa adı ekrana göre değişiyor ('Dönem yönetimi', 'Değerlendirme dönemi', 'Yeni değerlendirme dönemi'); bulgu değil.
