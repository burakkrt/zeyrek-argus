# memory/ — Argus'un zekası ve uygulamaların hafızası

Bu klasör Git'e girer. Takım arkadaşın `git pull` alınca aynı eğitimli kontrolcüyle çalışır; senin kararların
ve kuralların ona da geçer. Arayüzde **Hafıza → Dosyalar** buradaki her dosyayı düz metin olarak açar.

İki ayrı bölge vardır:

- **`brain/` — Argus'un kendisi.** Hangi rolün ne yaptığı, testin nasıl yapılacağı, neyin bulgu sayıldığı, önem
  tablosu, çıktı biçimleri, bütün Zeyrek uygulamalarına ortak kurallar. Bütün uygulamalara aynı uygulanır; insan okur
  ve geliştirir. Argus'un davranışını değiştirmek için önce buraya bakılır: davranışı anlatan metin koda yazılmaz.
- **`apps/` — uygulamaların hafızası.** Koşulardan ve insan kararlarından birikir: bulgular, kararlar, sayfa bilgisi,
  uygulamaya özel kurallar ve test yöntemleri.

Kodda (`server/`, `ui/`, `shared/`) yalnız mekanizma durur: araçlar, güvenlik kapıları, şemalar, akış. Yerel veri
(`data/`: koşu kayıtları, görüntüler, ayarlar) bu klasöre girmez.

```
brain/
  roles/*.md                     rol talimatları: her rolün ne yaptığı ve neye dikkat ettiği
  test/*.md                      test yöntemleri: testin nasıl yapılacağı, neyin bulgu sayılmadığı
  formats/*.md                   bulgu çıktı biçimleri (Markdown şablonu)
  platform/rules/*.md            bütün Zeyrek uygulamalarına ortak kurallar
apps/<proje>/<uygulama>/
  app.md                         uygulama notları (isteme girer)
  rules/*.md                     uygulamaya özel kurallar
  test/*.md                      uygulamanın ve modüllerinin test yöntemleri (kritik akışlar, kurallar)
  decisions/*.md                 sorun başına insan kararı, tarihçe ve yorumlar (Git'te union ile birleşir)
  findings/<kimlik>.md            o kişinin makinesinde açık duran bulgular ve kayıtlı vakaları (koşu sonunda yazılır)
  pages/<sayfa>/<kimlik>.md       sayfa bilgisi: kontrolcünün damıttığı (isteme en yenisi girer)
  customer/*.md                  içe aktarılan müşteri bulguları (isteme girmez)
```

## Rol talimatları

`brain/roles/` her rolün talimatıdır. Koşunun başında okunur: düzenleme sonraki koşuda geçerlidir.

| Dosya | Rol | Ne zaman çalışır |
|---|---|---|
| `temel.md` | Ortak temel | Bütün rollerin sistem talimatı: üç yol (tanım, ekran, çalıştırma), kanıt kuralı, önem tablosu |
| `planlayici.md` | Planlayıcı | Koşunun başında: isteği okur, kapsamı, senaryoları ve test vakalarını yazar |
| `arastirmaci.md` | Araştırmacı | Tanım vakası: tanımı okur, test verisi kurar, çalıştırır, sonucu okur |
| `sayfa-plani.md` | Sayfa planlayıcısı | Tarayıcıda test edilecek sayfanın görevlerini planlar |
| `goz.md` | Göz | Gezginin ulaştığı her yeni ekranı inceler |
| `terim-gozu.md` | Terim gözü | Sayfa sonunda etiketlerde aynı kavramın farklı adla geçtiği yeri arar |
| `yargic.md` | Yargıç | Gezginin, gözün ve terim gözünün aday bulgusunu kayda girmeden önce denetler |
| `gozetmen.md` | Gözetmen | Kalemler bitince kapsamı denetler, kaçmış bulguyu yazar, ek kalem ister |
| `damitici.md` | Damıtıcı | Koşu sonunda sayfa bilgisini günceller |

```
---
kimlik: yargic               # kodun bu dosyayı bulduğu ad; değiştirme
rol: Yargıç
aciklama: Tek satır; ne yaptığı
---
Ana metin.

## Parça: son-tur               # isteğe bağlı: koşula göre eklenen metin (kod adıyla ister)
```

- `{{ad}}` yer tutucusunu kod o anın bilgisiyle doldurur (ör. sayfa planında görev sayısı). Yer tutucuyu silmek ya da
  adını değiştirmek koşuyu nedenini söyleyerek durdurur; eksik talimatla sessizce koşulmaz.
- Verinin kendisi (sayfa ağacı, aday bulgu, istek, bilinen sorunlar) koddan eklenir; metin yalnız talimattır.
- Testin nasıl yapılacağı (öncelik, neye bakılır, ne bulgu sayılmaz) rol dosyasına değil test yöntemine yazılır: rol
  "ne yaparsın", yöntem "nasıl test edilir" der.
- Kaldırılan ya da yeni eklenen rol kodla birlikte değişir (`server/src/memory/roles.ts`, `ROLE_IDS`).

## Test yöntemleri

Testin nasıl yapılacağı kodda değil burada yazılır ve zamanla geliştirilir. Her dosyanın ön bilgisi:

```
---
kimlik: akis                 # küçük harf, rakam, tire; planlayıcı bu adla seçer
aciklama: Tek satır; planlayıcı yalnız bunu görür ve isteğe uyanı seçer
her_kosu: evet               # isteğe bağlı: her koşuda yüklenir (genel ilkeler)
---
Gövde: neye, nasıl, hangi sırayla bakılacağı; neyin bulgu sayılmadığı.
```

- Koşunun başında planlayıcı dizini görür ve isteğe uyan yöntemleri seçer (ek model çağrısı yoktur). Girdisiz sayfa
  taraması `genel` ve `arayuz` ile koşar.
- Seçilenler koşunun önbellekli talimatına girer: dosya başına 5.000, toplam 12.000 karakter. Aşan dosya kesilir ve
  akışta söylenir; kısa ve öz yaz.
- `arayuz` seçilmezse ekranları göz incelemez: akış ve kural testinde arayüz bulgusu gürültüdür, göz de en pahalı roldür.
- Uygulamanın `test/` klasöründeki aynı kimlikli dosya platformunkinin yerine geçer.
- Araç kullanımı ve güvenlik kuralları koddadır; yöntem dosyası onları değiştiremez.
- Yöntem değişikliği davranışı değiştirir: önemli bir değişiklikten sonra aynı isteği bir kez koşup sonucu karşılaştır.

## Çakışmasız paylaşım

Git çakışması çıkmaması için her dosyanın tek bir yazarı vardır ya da birleşmesi tanımlıdır:

- `findings/`, `pages/` altında herkes yalnız kendi dosyasını yazar (`<kimlik>`: makinenin otomatik yazar kimliği, elle girilmez). Okurken
  hepsi birleştirilir: sayfa bilgisinden en yenisi, bulgulardan herkesinki
  ("başka makinelerde görüldü").
- `decisions/` dosyasını yalnız insanlar yazar (Argus'un "düzeldi" gözlemi yereldir). Aynı soruna iki kişi aynı anda
  karar ya da yorum yazarsa `.gitattributes` dosyaları Git'in union sürücüsüyle birleştirir; satırların hiçbiri
  kaybolmaz, durum tarihçenin en son geçişinden okunur.
- Kural ve uygulama notu dosyalarını elle düzenleyen iki kişi aynı satırı değiştirirse olağan Git çakışması çıkar;
  bunlar seyrek ve bilinçli değişikliklerdir.

Koşu kayıtları, görüntüler, ayarlar, hesaplar ve kullanım sayaçları bu klasöre girmez (`data/`, yalnız o bilgisayar).

## Kural dosyası

```markdown
---
id: sapkali-harf
kapsam: uygulama            # platform | uygulama | modul:<önek> | sayfa:<slug>
tur: sorun                  # sorun (ara) | sorun-degil (bulgu sayma) | bilgi (bağlam)
durum: onayli               # aday | onayli | emekli
desen: "[âîûÂÎÛ]"           # isteğe bağlı: ekranda aranan düzenli ifade (token harcamaz)
kaynak: [musteri:Kitap1.xlsx#2]
olusturan: Burak
tarih: 2026-11-13
---
Arayüzde şapkalı harf (â, î, û) kullanılmaz.
```

- Yalnız `onayli` kurallar isteme girer; `aday` olanlar Hafıza ekranında onay bekler, `emekli` olanlar dosyada kalır
  ama kullanılmaz (geçmiş Git'te).
- Deseni olan kural isteme hiç girmez: sayfada belirlenimci göz olarak koşar.
- Kullanım sayaçları dosyada değil, yerel veritabanında tutulur (her koşu Git'te fark üretmesin). "Yanılttı" sayacı
  kurala dayanan bulguya "bulgu değil" denince ya da "sorun sayma" kuralının bastırdığı sorun gerçek çıkınca artar;
  iki kez yanıltan (ve kullanımının yarısından fazla yanıltan) kural bakımda emekliye önerilir, insan onaylar.

## Kayıtlı vaka

Çalıştırılarak kanıtlanan bulgunun bulgu dosyasındaki bölümünde `adimlar:` satırı durur: bulguyu kanıtlayan platform
çağrıları (araç, girdi, yazma mı), JSON, en çok 25 adım, girdi başına 800 karakter. "Kayıtlı vakaları doğrula" ve
"Yayın kapısı" bunları yeniden kurar; takım arkadaşının vakası da (kendi makinende görülmemiş olsa bile) doğrulanır.
Bozuk satır yok sayılır, bulgu kaybolmaz.

## Platform notu

Hafıza → Kurallar → **Platform notu** onaylı kuralları Zeyrek projesinin `ai-notlari/` klasörüne konacak tek dosya
(`argus-dersleri.md`) olarak önizler: uygulamayı geliştiren yapay zekâ Argus'un öğrendiği hatayı yapmasın. Yalnız
`onayli` kurallar girer, sıra belirlenimcidir. Aktarma (ne zaman, kimin onayıyla, nasıl yüklenir) henüz
kararlaştırılmadı; Argus bu dosyayı hiçbir yere yazmaz.

## Sayfa bilgisi

Kontrolcü her koşunun sonunda kendi dosyasına yazar (yeni öğrenme yoksa yazmaz); ön bilgide yazıldığı andaki sayfa izi
(`iz_arayuz`, `iz_veri`, `iz_studio`) durur, böylece sonraki koşu (kimin olursa olsun) sayfanın o bilgiden beri
değişip değişmediğini bilir; elle düzeltmek serbesttir (sonraki koşu düzeltmeyi okuyup damıtmayı sürdürür).
Bölümler: Amaç, Ekranlar, Beklentiler (güven: yüksek / orta / düşük), Kapsanan, Kapsanmayan, Tuhaflıklar. Liste başına
üst sınır vardır, isteme giren bilgi koşu sayısıyla büyümez. Senin kararların kesindir: "bulgu değil" dediğin davranış
tuhaflıklara gerekçesiyle girer, ona aykırı beklenti silinir.

## Karar dosyası

Arayüzde bir bulguya karar verince ya da yorum yazınca oluşur. Elle de düzenlenebilir; kaydedince veritabanına
işlenir. `durum`: `acik` | `duzeltilecek` | `bulgu-degil` | `duzeldi`.

- `karar_izi: <sayfa>:<Studio izi>`: "bulgu değil" kararı verildiği andaki sayfa tanımına bağlanır. Sonraki bir koşu
  aynı sayfada tanımın değiştiğini görürse sorun yeniden açılır ("karar gözden geçirilmeli"): modülün mantığı
  değişince eski bir "bulgu değil" sonsuza kadar sorun gizlemez. İz yoksa (tanım okunamadıysa) karar geçerli kalır.
- Tartışmalı: iki kişinin son hükümleri zıtsa (biri düzeltilecek, öteki bulgu değil) sorun bastırılmaz, öğrenmeye
  girmez ve arayüzde "Tartışmalı" rozeti taşır. Ayrışan kişi kararını değiştirince ya da karşı kararı seçerek
  onaylayınca çözülür; kişinin kendi kararını yinelemesi çözmez.

## Biçim dosyası

`brain/formats/<ad>.md`: `{{baslik}}`, `{{tur}}`, `{{durum}}`, `{{sayfalar}}`, `{{senaryo}}`, `{{beklenen}}`, `{{gozlenen}}`,
`{{ekran}}`, `{{anahtar}}`, `{{ilk}}`, `{{son}}`, `{{gorulme}}`; tekrar eden bölüm `{{#yorumlar}}{{yazar}}: {{metin}}{{/yorumlar}}`.
