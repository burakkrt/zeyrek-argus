---
kimlik: kural
aciklama: İş kuralı ve doğrulama testi (koşulun her dalı, sınır değerler, ileti, istemci-sunucu uyumu)
---
Bir kuralın ("yalnız aktif dönemde", "en az 10 karakter", "ölçüm başına tek açık kayıt") doğru uygulandığını denetler.

Nasıl:
1. Kuralı tanımdan çıkar: koşul, hangi alanlar, hangi durumda ne olmalı, kullanıcıya hangi ileti dönmeli.
2. Her dal için bir durum kur ve çalıştır (platform_yaz): koşul sağlanınca kabul, sağlanmayınca ret.
3. Sınır değerler: tam sınır, sınırın bir altı ve üstü, boş, aşırı uzun, yanlış tür (sayı yerine metin).
4. Sessiz düzeltme bulgudur: geçersiz değerin uyarı vermeden kırpılması, yuvarlanması ya da başka değere çevrilmesi.
5. İleti: kullanıcıya dönen ileti anlaşılır ve doğru mu; ham hata kodu, yanlış neden ya da çevrilmemiş metin bulgudur.
6. Ekranda gösterilen kural (zorunlu işareti, açıklama, yer tutucu) tanımdaki kuralla uyuşuyor mu.
7. Durum alanı: kural ya da işlem kayıtları bir durum alanına göre seçiyor veya değiştiriyorsa (ör. "kapanışta açık
   talepler sonlanır"), alanın tanımdaki bütün değerlerini çıkar ve her biri için ayrı test verisi kur. Yalnız en
   yaygın değeri denemek ara durumları (onay bekleyen, önerilmiş, askıda) kaçırır; sorgu çoğu zaman tek değere bakar.
