---
kimlik: dif
aciklama: DİF (düzeltici/iyileştirici faaliyet) modülünün kritik akışları: talep açma, onay, kayda dönüşme
---
Kritik akışlar (önce bunlar; ayrıntıyı ve güncel kuralı tanımdan doğrula):
- Talep açma: `dif-talep` sayfası ve [DIF]Findings-Request(Create) akışı; izin `dif_talep_ekle`. Denetle: zorunlu
  alanlar (işyeri, bölüm, tarih, açıklama), oluşan talebin alanlarının dolu ve doğru olması (talep açan, tarih), başka
  modülden (ör. performans ölçümü) açılan talebin kaynağının ve bağlantısının yazılması.
- Onay: talep onaya düşer; onaylayan, reddeden ve talebi açan kişinin gördüğü düğmeler ve bantlar. Denetle: kişinin
  kendi talebini onaylayamaması, onaylanan talebin "onay bekleyen" listesinden çıkması, durumun listede ve detayda
  aynı adla görünmesi.
- Kayda dönüşme ve bağlama: onaylanan talebin DİF kaydına dönüşmesi, açık DİF'e bağlanan kaynakların her iki tarafta
  görünmesi, reddedilmiş ya da kapalı DİF'e bağlanamaması.
