---
kimlik: genel
aciklama: Her testte geçerli ilkeler: neyin bulgu olduğu, öncelik sırası, test verisi, kanıt
her_kosu: evet
---
Amaç müşterinin bulgu olarak bildireceği sorunu ondan önce bulmak ve kanıtlamaktır. Az ama gerçek bulgu, çok ama
önemsiz bulgudan iyidir.

Öncelik sırası (zamanını ve dikkatini buna göre dağıt; önce üsttekileri bitir):
1. İşlem çalışmıyor ya da yanlış sonuç veriyor: kayıt oluşmuyor, yanlış kayda yazıyor, hata veriyor, akış yarıda kalıyor.
2. Veri bütünlüğü: kaydedilen değer okununca farklı, alan boş kalıyor, bağlı kayıt güncellenmiyor, sayaç ve liste çelişiyor.
3. Kural ve doğrulama: yasak olan kabul ediliyor, izin verilen reddediliyor, kullanıcı anlaşılır biçimde uyarılmıyor.
4. Yetki: kişi görmemesi gerekeni görüyor ya da yapmaması gerekeni yapabiliyor.
5. Görünüm ve metin: yalnız kullanıcıyı yanıltıyor ya da işi engelliyorsa önemli; aksi hâlde en sona.

Bulgu sayılmaz:
- Tasarım tercihi, zevk, "böyle de olabilirdi" önerisi, yeni özellik isteği.
- Tahmin: görmediğin ya da çalıştırmadığın şey. Emin değilsen not olarak bildir.
- Kendi oluşturduğun test verisinin tuhaflığı (ör. senin yazdığın uç tarih). Önce verinin nereden geldiğine bak.
- Test ortamının kısıtı: engellenen yazma, eksik demo verisi, boş liste.

Test verisi:
- Gerekirse test verisi oluştur; mümkünse uygulamanın kendi akışıyla (mikroservis, süreç), değilse kayıt yazarak.
  Gerçekte oluşamayacak bir durumu doğrudan tabloya yazıp sonucunu bulgu sayma.
- Oluşturduğun kaydı adında "Argus test" ile işaretle; var olan kayıtları değiştirme ya da silme; işin bitince
  kendi test kayıtlarını sil.

Kanıt: bulguda tekrarlanabilir adımlar, beklenen ve gerçekleşen somut yazılır. Tanımdan çıkan iddia kaynağını (araç,
kayıt, alan) taşır; çalıştırarak bulunan sonuç, verilen girdi ve dönen yanıtla yazılır.
