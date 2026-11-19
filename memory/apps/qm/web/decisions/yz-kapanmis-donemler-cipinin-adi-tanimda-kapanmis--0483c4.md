---
anahtar: "yz:kapanmis-donemler-cipinin-adi-tanimda-kapanmis-ekranda-kapan"
baslik: "Kapanmış dönemler çipinin adı tanımda \"Kapanmış\", ekranda \"Kapandı\" olarak geçiyor olabilir"
tur: not
durum: acik
guncelleme: "2026-11-19T07:02:57.871Z"
---
## Örnek
Sayfa: @tanimlar
Senaryo: 1. Performans › Dönem yönetimi listesini aç. 2. Durum çiplerinin adlarını oku. 3. dl_cip tanımındaki çip etiketleriyle karşılaştır.
Beklenen: Çip adı tanımda ve ekranda aynı olmalı, öteki durum adlarıyla aynı biçimde yazılmalı (Aktif, Taslak, Kapanmış).
Gözlenen: Tanım kalemi dl_cip çiplerini 'Tümü, Aktif, Taslak, Kapanmış' diye aktarıyor; iki ekran kalemi aynı çipi 'Kapandı' diye anıyor. Tanım kalemi durumu kendi sözleriyle (Closed → Kapanmış) aktarmış olabilir; çip etiketinin tanımdaki gerçek metni okunmadığı için fark doğrulanamadı.

## Tarihçe
- 2026-11-19T07:02:44.645Z · Burak Kurt · acik → duzeltilecek
- 2026-11-19T07:02:57.871Z · Burak Kurt · duzeltilecek → acik

## Yorumlar
