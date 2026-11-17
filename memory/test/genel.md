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

Önem (her bulguya verilir; türden ayrıdır):
- S1 kritik: veri kaybı ya da bozulması, yetki sızıntısı, yanlış puan/hesap, akışın kilitlenmesi.
- S2 yüksek: kural ya da zorunlu alan atlatılıyor, geçersiz durum geçişi kabul ediliyor, işlem sunucu hatasıyla (500)
  çöküyor ya da iç hata ayrıntısı (veritabanı iletisi, yığın izi) kullanıcıya dönüyor, yanlış yönlendirme.
- S3 orta: anlaşılmaz ya da yanıltıcı ileti, kötü hata yönetimi; kullanıcının geçici bir çözümü var.
- S4 düşük: görünüm, metin, biçim.

Bulgu sayılmaz:
- Tasarım tercihi, zevk, "böyle de olabilirdi" önerisi, yeni özellik isteği.
- Tahmin: görmediğin ya da çalıştırmadığın şey. Emin değilsen not olarak bildir.
- Kendi oluşturduğun test verisinin tuhaflığı (ör. senin yazdığın uç tarih). Önce verinin nereden geldiğine bak.
- Kaydın içeriği: ad, kod, açıklama ve elle girilen tarihler kullanıcının ya da testlerin girdisidir. Bir kaydın kendi
  alanları birbirini tutmuyorsa ("2025" adlı dönem 2026'da bitiyor, adı ile kodu farklı yıl, iki kayıt aynı plana bağlı)
  bu bulgu değildir; adında TEST, test, Argus geçen ya da anlamsız harf dizisi olan kayıtların içeriği hiç değildir.
  Bulgu olan, sistemin davranışıdır: sistemin hesapladığı, türettiği ya da bir işlemle oluşturduğu değer yanlışsa, ya da
  engellemesi gereken bir girdiyi kabul ediyorsa (bitiş başlangıçtan önce kaydediliyor). O zaman bulgu eksik doğrulamadır:
  bir kez, kuralın adıyla yazılır; tek tek kayıtlar örnektir.
- Test ortamının kısıtı: engellenen yazma, eksik demo verisi, boş liste.

Bir kök neden bir bulgudur. Aynı mekanizmanın yeni bir örneği (başka sütun, satır, kayıt ya da ekran; ör. her tablo
sütununun filtresinde sütun türüne uymayan operatörler) yeni bulgu değildir: zaten bildirilenin anahtarını kullan,
yeni örneği gözlenende yaz. Önce "zaten bildirilenler" listesine bak.

Şüphe (not) son çaredir, emin olmadığın her şeyin yeri değildir. Bir adımla doğrulayabileceğin şeyi (filtreyi uygula,
kaydı oku, sayfayı yeniden aç) önce doğrula; doğrulandıysa bulgudur, doğrulanmadıysa yazma. Şüphe yalnız doğrulaması bu
araçlarla imkânsız olan, ama doğruysa önemli olan şey içindir; gözlenende neden doğrulanamadığını yaz. "Olabilir",
"emin değilim", "tasarım gereği olabilir" diye biten ve doğrulanmamış görüş bildirilmez.

Test verisi:
- Gerekirse test verisi oluştur; mümkünse uygulamanın kendi akışıyla (mikroservis, süreç), değilse kayıt yazarak.
  Gerçekte oluşamayacak bir durumu doğrudan tabloya yazıp sonucunu bulgu sayma.
- Oluşturduğun kaydı adında "Argus test" ile işaretle; var olan kayıtları değiştirme ya da silme; işin bitince
  kendi test kayıtlarını sil.

Kanıt: bulgu ancak gördüğün ya da çalıştırıp sonucunu okuduğun şeydir; tanımı okuyarak çıkardığın iddia şüphedir
(ayrı listede durur, bulgu sayılmaz). Kural beklendiği gibi çalışıyorsa bulgu yazılmaz. Bulguda tekrarlanabilir adımlar,
beklenen ve gerçekleşen somut yazılır. Tanımdan çıkan iddia kaynağını (araç,
kayıt, alan) taşır; çalıştırarak bulunan sonuç, verilen girdi ve dönen yanıtla yazılır.
