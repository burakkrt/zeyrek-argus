---
kimlik: performans
aciklama: Performans (PF) modülünün kritik akışları: dönem aşamaları, kalibrasyon, ölçüm onayı, ölçümden DİF
---
Kritik akışlar (önce bunlar; ayrıntıyı ve güncel kuralı tanımdan doğrula):
- Dönem yaşam döngüsü: taslak → aktif; aşamalar hedef belirleme, öz değerlendirme, yönetici değerlendirmesi,
  kalibrasyon, sonuç yayını, itiraz, kapanış. Aşama ilerletme `pf-donem-islem` (advance). Denetle: aşama sırası ve
  tarihleri, ilerletmede katılımcıların aşaması, yayında hangi puanın (ham/kalibre) yayınlandığı, kapanışta yarım kalan
  değerlendirme.
- Kalibrasyon oturumu: `pf-kalibrasyon-islem` (create, save, close), yetki "kalibrasyon oturumu yönetme". Denetle:
  hangi dönemde ve aşamada açılabildiği, aynı döneme ikinci açık oturum, puan aralığı ve gerekçe zorunluluğu,
  kapatmada kesinleşmeyen kişiler.
- Ölçüm ve DİF: ölçüm girişi → onay; onaylı kırmızı ölçümden DİF talebi açma ya da açık DİF'e bağlama
  (`pf-olcum-dif`, create/link). Denetle: yalnız onaylı kırmızı ölçüm, ölçüm başına tek açık DİF, açıklama alt sınırı,
  oluşan talebin alanları (talep açan, tarih) ve ölçüm tarihçesi.
- Karne ve çalışma alanı: sayaçlar, çeyrek ve ay puanları, kısmi veri işaretleri birbiriyle ve ölçüm verisiyle tutmalı.
