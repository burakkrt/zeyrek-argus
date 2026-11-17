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

Platformun ortak bileşenleri bütün uygulamalarda aynı koddur: tablo (kolon filtresi ve operatör menüsü, sıralama,
sayfalama, sayfa başına satır, kolonlar menüsü, gelişmiş filtre, filtre çipleri), gezinti yolu, sekme başlığı, sol menü,
arama penceresi. Bir uygulama sayfasında bunların genel davranışını baştan test etme; tek görevde kısa yokla (bir
filtre, bir sıralama, bir sayfa geçişi). Ayrıntılı test edilen bu sayfaya özgü olandır: hangi kolonların olduğu ve
adları, hücrelerdeki verinin doğruluğu ve birbiriyle tutarlılığı, sayfanın kendi düğmeleri, formları ve akışları.
Bileşenin genel bir hatası bir kez kaydedilir; aynı hatayı başka kolonda ya da başka sayfada yeniden arama, bilinen
sorunun anahtarıyla yeni örnek olarak ekle. İstek açıkça tablonun ya da filtrelerin kendisini test ettiriyorsa bu
sınır kalkar.

Dikkat:
- "?" ipucundaki tanım durumu açıklıyorsa bulgu değildir. Boş liste çoğunlukla veri eksikliğidir.
- Test amaçlı kayıt adları ("test", "silinecek", anlamsız harfler) bulgu değildir. Filtreye yazılıp henüz uygulanmamış
  değer bulgu değildir.
- İstek bir sayfanın ya da modülün genel arayüz kalitesini test ettiriyorsa o sayfalar tam taranır (bütün bölgeler,
  pencereler, sekmeler); platformun ortak bileşenleri yukarıdaki gibi kısa yoklanır.
