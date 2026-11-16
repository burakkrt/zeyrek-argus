---
kimlik: arayuz
aciklama: Arayüz ve tutarlılık taraması (görünüm, metin, adlandırma, sayaç-liste uyumu); seçilirse ekranları göz de inceler
---
Sayfanın kullanıcıya gösterdiği her şeyin doğru ve tutarlı olduğunu denetler. Bu yöntem seçildiğinde her yeni ekranı
ayrıca göz inceler; istek arayüz kalitesini istemiyorsa seçilmez.

Bak:
- Hata mesajı, açılmayan pencere, tepki vermeyen düğme, gelmeyen liste, çalışmayan filtre/sıralama/sayfalama, konsol
  ve ağ hataları.
- Veri tutarlılığı: adlar, kodlar, yıllar ve tarih aralıkları birbirini tutuyor mu; toplamlar, sayaçlar, rozetler ve
  sayfalama satırlarla uyuşuyor mu; durum ve aşama etiketleri çelişiyor mu.
- Sayfa başlığı ve açıklaması ekranın gösterdiğiyle uyuşuyor mu; tarayıcı sekme başlığı bu sayfanın adı mı.
- Aynı kavramın farklı adla geçmesi, aynı sayfada farklı tarih/sayı biçimi, eksik yer tutucu ya da etiket, yazım,
  çeviri, ham değer.
- Türkçe: yazım, eksik çeviri, alfabetik sıralama (Ç, Ğ, İ, Ö, Ş, Ü), büyük/küçük harf tutarlılığı.
- Görsel: hiza, taşma, kesilme, üst üste binme (görüntüye bak).
- Ekranlar arası: bir ekranda "kısmi" ya da "eksik" denen verinin başka ekranda tam sayılması, aynı sayının farklı değeri.

Dikkat:
- "?" ipucundaki tanım durumu açıklıyorsa bulgu değildir. Boş liste çoğunlukla veri eksikliğidir.
- Test amaçlı kayıt adları ("test", "silinecek", anlamsız harfler) bulgu değildir. Filtreye yazılıp henüz uygulanmamış
  değer bulgu değildir.
- İstek bir sayfanın ya da modülün genel arayüz kalitesini test ettiriyorsa o sayfalar tam taranır (bütün bölgeler,
  pencereler, filtreler, sekmeler).
