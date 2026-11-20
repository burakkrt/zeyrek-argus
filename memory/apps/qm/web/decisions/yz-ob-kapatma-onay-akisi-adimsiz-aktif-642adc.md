---
anahtar: "yz:ob-kapatma-onay-akisi-adimsiz-aktif"
baslik: Adımı olmayan "İnceleme kapatma onayı" akışı aktif kalabiliyor; inceleme onaya gitmeden kapanıyor
tur: not
durum: acik
guncelleme: "2026-11-20T20:48:36.883Z"
karar_izi: "ob-inceleme:ad2f3e28b06a6c4b"
---
## Örnek
Sayfa: ob-inceleme
Senaryo: Akış yönetimi listesini oku (ob-ayar-akis, op=list): 'İnceleme kapatma onayı' aktif, adımları boş. Bir incelemeyi Geri bildirim adımına getir ve ob-inceleme-kapat ile kapat (kayıt 29 / inceleme 7). Yanıtı ve ob_approvals tablosunu oku.
Beklenen: Akış aktif ve açıklaması 'kalite yöneticisinin onayı' dediği için kapatma onaya gitmeli; onaycı tanımlı değilse uyarı verilmeli ya da yetkililere düşmeli.
Gözlenen: Akış is_active=true, steps=[]. Kapatma 'İnceleme kapatıldı.' ile doğrudan Closed oldu, ob_approvals'ta satır oluşmadı. Onay motoru adımı olmayan akışı 'approved' sayıyor. Aynı akışa onaycı adımı eklenince kapatma onaya gitti, ret ve onay doğru çalıştı.

## Tarihçe
- 2026-11-20T19:22:26.447Z · Burak Kurt · acik → bulgu-degil
- 2026-11-20T19:22:30.318Z · Burak Kurt · bulgu-degil → acik
- 2026-11-20T19:22:32.781Z · Burak Kurt · acik → duzeltilecek
- 2026-11-20T19:22:33.779Z · Burak Kurt · duzeltilecek → acik
- 2026-11-20T20:48:08.227Z · Burak Kurt · acik → duzeltilecek
- 2026-11-20T20:48:09.097Z · Burak Kurt · duzeltilecek → kabul-edildi
- 2026-11-20T20:48:36.883Z · Burak Kurt · kabul-edildi → acik

## Yorumlar
