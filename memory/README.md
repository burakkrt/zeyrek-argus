# memory/ — kontrolcünün paylaşılan hafızası

Bu klasör Git'e girer. Takım arkadaşın `git pull` alınca aynı eğitimli kontrolcüyle çalışır; senin kararların
ve kuralların ona da geçer. Arayüzde **Hafıza → Dosyalar** buradaki her dosyayı düz metin olarak açar.

```
platform/rules/*.md              bütün Zeyrek uygulamalarına ortak kurallar
formats/*.md                     bulgu çıktı biçimleri (Markdown şablonu)
apps/<proje>/<uygulama>/
  app.md                         uygulama notları (isteme girer)
  rules/*.md                     uygulamaya özel kurallar
  decisions/*.md                 sorun başına karar, tarihçe ve yorumlar
  customer/*.md                  içe aktarılan müşteri bulguları (isteme girmez)
```

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

## Karar dosyası

Arayüzde bir bulguya karar verince ya da yorum yazınca oluşur. Elle de düzenlenebilir; kaydedince veritabanına
işlenir. `durum`: `acik` | `duzeltilecek` | `bulgu-degil` | `duzeldi`.

## Biçim dosyası

`formats/<ad>.md`: `{{baslik}}`, `{{tur}}`, `{{durum}}`, `{{sayfalar}}`, `{{senaryo}}`, `{{beklenen}}`, `{{gozlenen}}`,
`{{ekran}}`, `{{anahtar}}`, `{{ilk}}`, `{{son}}`, `{{gorulme}}`; tekrar eden bölüm `{{#yorumlar}}{{yazar}}: {{metin}}{{/yorumlar}}`.
