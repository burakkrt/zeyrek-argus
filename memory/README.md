# memory/ — kontrolcünün paylaşılan hafızası

Bu klasör Git'e girer. Takım arkadaşın `git pull` alınca aynı eğitimli kontrolcüyle çalışır; senin kararların
ve kuralların ona da geçer. Arayüzde **Hafıza → Dosyalar** buradaki her dosyayı düz metin olarak açar.

```
platform/rules/*.md              bütün Zeyrek uygulamalarına ortak kurallar
formats/*.md                     bulgu çıktı biçimleri (Markdown şablonu)
apps/<proje>/<uygulama>/
  app.md                         uygulama notları (isteme girer)
  rules/*.md                     uygulamaya özel kurallar
  decisions/*.md                 sorun başına insan kararı, tarihçe ve yorumlar (Git'te union ile birleşir)
  findings/<yazar>.md            o kişinin makinesinde açık duran bulgular (koşu sonunda yazılır)
  pages/<sayfa>/<yazar>.md       sayfa bilgisi: kontrolcünün damıttığı (isteme en yenisi girer)
  customer/*.md                  içe aktarılan müşteri bulguları (isteme girmez)
```

## Çakışmasız paylaşım

Git çakışması çıkmaması için her dosyanın tek bir yazarı vardır ya da birleşmesi tanımlıdır:

- `findings/`, `pages/` altında herkes yalnız kendi dosyasını yazar (`<yazar>`: Ayarlar'daki ad). Okurken
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
- Kullanım sayaçları dosyada değil, yerel veritabanında tutulur (her koşu Git'te fark üretmesin).

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

## Biçim dosyası

`formats/<ad>.md`: `{{baslik}}`, `{{tur}}`, `{{durum}}`, `{{sayfalar}}`, `{{senaryo}}`, `{{beklenen}}`, `{{gozlenen}}`,
`{{ekran}}`, `{{anahtar}}`, `{{ilk}}`, `{{son}}`, `{{gorulme}}`; tekrar eden bölüm `{{#yorumlar}}{{yazar}}: {{metin}}{{/yorumlar}}`.
