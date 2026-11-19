---
anahtar: "yz:gecersiz-takvim-tarihi-2030-13-45-500-ile-cokuyor-veritabani"
baslik: "Geçersiz takvim tarihi (2030-13-45) 500 ile çöküyor, veritabanı iletisi kullanıcıya dönüyor"
tur: kesin
durum: acik
guncelleme: "2026-11-18T22:07:17.359Z"
---
## Örnek
Sayfa: @tanimlar
Senaryo: pf-donem-islem'e payload {action:save, name:"Argus test gecersiz tarih", form_template:1, plan:12, goal_setting_end:"2030-13-45"} gönder (dönem yönetme yetkili kullanıcıyla).
Beklenen: val adımı tarihi geçersiz sayıp 'Hedef belirleme bitişi geçerli bir tarih olmalıdır.' iletisiyle alan adlandırarak reddeder (200, ok:false), 500 dönmez.
Gözlenen: val kodundaki tarih denetimi yalnız /^\d{4}-\d{2}-\d{2}$/ biçimine bakıyor; 13. ay ve 45. gün geçiyor. İş savN adımında veritabanına düşüp httpStatus 500 dönüyor; gövde: {"ok":false,"message":"22008: date/time field value out of range: \"2030-13-45\"","errors":[{"code":"PostgresException","step":"savN"}]}. Ham PostgreSQL hata kodu/iletisi ve iç adım adı kullanıcıya sızıyor. Kayıt oluşmadı (dönem tablosu değişmedi). (Çalıştırılarak doğrulandı; kaynak: microservice_execute pf-donem-islem POST asUserId=0198bcba-1105-71e9-b8d0-daad1a2b3bea; yanıt httpStatus 500 (yukarıdaki gövde). val adımı: const re = /^\d{4}-\d{2}-\d{2}$/; dateInvalid iletisi yalnız !re.test(v) için. Sonrasında pf-donemler okundu, yeni kayıt yok.)

## Tarihçe
- 2026-11-18T21:29:07.120Z · Burak Kurt · acik → duzeltilecek
- 2026-11-18T22:05:39.098Z · Burak Kurt · duzeltilecek → acik
- 2026-11-18T22:07:10.941Z · Burak Kurt · acik → duzeltilecek
- 2026-11-18T22:07:17.359Z · Burak Kurt · duzeltilecek → acik

## Yorumlar
