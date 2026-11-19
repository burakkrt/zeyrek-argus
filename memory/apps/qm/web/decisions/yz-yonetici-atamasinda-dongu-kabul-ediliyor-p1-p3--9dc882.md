---
anahtar: "yz:yonetici-atamasinda-dongu-kabul-ediliyor-p1-p3-birbirinin-yo"
baslik: Yönetici atamasında döngü kabul ediliyor (P1↔P3 birbirinin yöneticisi oluyor)
tur: kesin
durum: acik
guncelleme: "2026-11-18T22:05:09.078Z"
---
## Örnek
Sayfa: @tanimlar
Senaryo: ARGUS-P1'in yöneticisi ARGUS-P3 yapıldı (kurulum). Sonra pf-donem-islem assign ile dönem 70'te P3'e yönetici olarak P1 atandı (payload.user=P3, payload.manager=P1).
Beklenen: P1'in yöneticisi zaten P3 iken P3'ün yöneticisinin P1 yapılması döngüsel atama sayılıp anlaşılır iletiyle reddedilmeli; personel kartı ve değerlendirme kaydı değişmemeli.
Gözlenen: İstek ok:true, 'Yönetici atandı ve değerlendirme kaydı açıldı.' döndü. Geri okumada P3.manager=P1 ve P1.manager=P3 (karşılıklı döngü). Dönem 70'te P3 için değerlendirme 101 açıldı: yönetici P1, ikinci yönetici P3'ün kendisi (kişi kendi ikinci yöneticisi). val adımı yalnız kişi=yönetici durumunu reddediyor; asg sorgusu (UPDATE users SET manager=@manager WHERE id=@target) yönetici zincirini denetlemiyor. Döngü yönetici onay zincirini (yönetici/ikinci yönetici) kilitleyebilir ya da kişiyi kendi değerlendirmesinin onaycısı yapar. (Çalıştırılarak doğrulandı; kaynak: microservice_execute pf-donem-islem body {id:70,payload:{action:assign,user:01a1e8a4-856f-7d70-8dd0-2c61129d9649,manager:01a1e877-3ce1-71c9-9b77-55d6d093fca2}} → 200 {ok:true,message:'Yönetici atandı ve değerlendirme kaydı açıldı.'}; row_list users: ARGUS-P3.manager=P1, ARGUS-P1.manager=P3; pf_evaluations 101 (period 70, employee P3, manager P1, second_manager P3). Workflow asg adımı rawQuery'de döngü kontrolü yok.)

## Tarihçe
- 2026-11-18T22:04:46.094Z · Burak Kurt · acik → duzeltilecek
- 2026-11-18T22:04:55.026Z · Burak Kurt · duzeltilecek → acik
- 2026-11-18T22:05:01.219Z · Burak Kurt · acik → bulgu-degil
- 2026-11-18T22:05:09.078Z · Burak Kurt · bulgu-degil → acik

## Yorumlar
