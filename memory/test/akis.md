---
kimlik: akis
aciklama: İş akışı ve işlev testi (bir işlemi baştan sona yapmak, hata yolları, sonucun veride doğrulanması)
---
Bir işlevi ("talep aç", "dönemi ilerlet", "ölçüm gir") test ederken kullanıcının yapacağı işi baştan sona yap ve
sonucunu doğrula. Arayüzün görünümü bu testin konusu değildir; yalnız işi engelleyen ya da yanıltan görünüm sorunu bildirilir.

Nasıl:
1. Akışı tanımdan öğren: hangi sayfa, hangi düğme hangi akışı/mikroservisi çağırıyor, girdi alanları, koşullar,
   aşama geçişleri, sonuçta hangi kayıtlar yazılıyor.
2. Ana yol: geçerli test verisiyle işlemi yap (platform_yaz). Sonra sonucu oku: kayıt oluştu mu, alanlar doğru mu,
   bağlı kayıt (tarihçe, bağlantı, sayaç) güncellendi mi, ekranda doğru görünüyor mu.
3. Hata yolları: zorunlu alan boş, geçersiz değer, sınır değer, yanlış durumdaki kayıt, aynı işlemin ikinci kez
   yapılması. Her birinde işlem reddedilmeli ve kullanıcıya anlaşılır ileti dönmeli; ham teknik hata bulgudur.
4. Yan etkiler: işlem yarıda kalırsa geride yarım kayıt kalıyor mu; bildirim, onay zinciri ve sonraki aşama doğru mu.
5. Ekranda teyit: oluşan kaydı ilgili listede ve detayda aç; ekranda görünen ile veride yazan aynı mı.

"Basit test" isteniyorsa: ana yol + en önemli 2-3 hata yolu + sonucun veride ve ekranda doğrulanması. Sayfanın tam
arayüz taraması yapılmaz.
