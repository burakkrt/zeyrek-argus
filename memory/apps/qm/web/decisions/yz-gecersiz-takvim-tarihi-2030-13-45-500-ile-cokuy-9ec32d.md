---
anahtar: "yz:gecersiz-takvim-tarihi-2030-13-45-500-ile-cokuyor-veritabani"
baslik: "Geçersiz takvim tarihi (2030-13-45) 500 ile çöküyor, veritabanı iletisi kullanıcıya dönüyor"
tur: kesin
durum: acik
guncelleme: "2026-11-19T12:21:15.466Z"
---
## Örnek
Sayfa: @tanimlar
Senaryo: pf-donem-islem'e dönem yönetme yetkili kullanıcıyla (asUserId=0198bcba-1105-71e9-b8d0-daad1a2b3bea) payload {action:save, name:"Argus test gecersiz tarih", form_template:1, plan:12, goal_setting_end:"2030-13-45"} gönder.
Beklenen: val adımı tarihi geçersiz sayıp 'Hedef belirleme bitişi geçerli bir tarih olmalıdır.' iletisiyle alan adlandırarak reddeder (200, ok:false); 500 dönmez.
Gözlenen: httpStatus 500; gövde {"ok":false,"message":"22008: date/time field value out of range: \"2030-13-45\"","errors":[{"code":"PostgresException","step":"savN"}]}. val adımındaki tarih denetimi yalnız /^\d{4}-\d{2}-\d{2}$/ biçimine bakıyor, 13. ay ve 45. gün geçiyor; ham PostgreSQL kodu/iletisi ve iç adım adı (savN) kullanıcıya sızıyor. Önceki gözlemle birebir aynı, yeniden doğrulandı. (Çalıştırılarak doğrulandı; kaynak: microservice_execute pf-donem-islem POST asUserId=0198bcba-1105-71e9-b8d0-daad1a2b3bea, yukarıdaki gövde; yanıt 500. workflow_get 01a13fba-41ad-715c-8ca0-d5eed52ef9eb steps[name=val].rule: const re = /^\d{4}-\d{2}-\d{2}$/; dateInvalid yalnız !re.test(v) için.)

## Tarihçe
- 2026-11-18T21:29:07.120Z · Burak Kurt · acik → duzeltilecek
- 2026-11-18T22:05:39.098Z · Burak Kurt · duzeltilecek → acik
- 2026-11-18T22:07:10.941Z · Burak Kurt · acik → duzeltilecek
- 2026-11-18T22:07:17.359Z · Burak Kurt · duzeltilecek → acik
- 2026-11-19T08:19:00.307Z · Burak Kurt · acik → bulgu-degil
- 2026-11-19T08:19:05.870Z · Burak Kurt · bulgu-degil → acik
- 2026-11-19T08:19:09.343Z · Burak Kurt · acik → duzeltilecek
- 2026-11-19T08:19:12.000Z · Burak Kurt · duzeltilecek → acik
- 2026-11-19T12:21:12.888Z · Burak Kurt · acik → duzeltilecek
- 2026-11-19T12:21:15.466Z · Burak Kurt · duzeltilecek → acik

## Yorumlar
