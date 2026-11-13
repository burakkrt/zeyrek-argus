# Zeyrek Argus

Zeyrek platformu üstündeki uygulamalara (ör. IMS Cortex) **o uygulamaya özel yetişen bir yapay zekâ kalite
kontrolcüsü**. Sayfaları bir kullanıcı gibi gezer, sorunu işaretli ekran görüntüsüyle bildirir, senin
kararlarından ve müşteri bulgularından öğrenir. Öğrendiği her şey `memory/` altında düz dosyadır; takım `git pull`
alınca aynı eğitimli kontrolcüyle çalışır. Sen her adımı monitörden canlı izler, yönlendirir, düzeltirsin.

## Kurulum

Gerekenler: Node 24+, pnpm 10, Zeyrek App klasörü (içinde `zeyrek-mcp` kurulu ve `.env`'i dolu). Docker gerekmez.

```bash
pnpm install
pnpm browsers:install
cp .env.example .env      # ARGUS_ZEYREK_APP_DIR ve ANTHROPIC_API_KEY satırlarını doldur
pnpm dev                  # http://localhost:5300
```

Platform adresi, kuruluş ve kullanıcı Argus'ta yazılmaz; `zeyrek-mcp/.env`'den okunur. Uygulama kendi giriş
ekranını gösteriyorsa (kompleks proje) **Ayarlar → Uygulama kullanıcıları**'ndan bir kullanıcı ekle (yalnız bu
bilgisayarda saklanır).

## Ekranlar

| Ekran    | Ne yapar                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Başlat   | Proje → uygulama → ortam/dal → sayfalar (MCP'den canlı); görev ve adım sınırı; tahmini süre ve maliyet                                                                                                                             |
| Monitör  | Akış: araştırma, plan, görevler, her adım (neden + sonuç + küçük görüntü), ağ istekleri, bulgular. Yanında canlı tarayıcı görüntüsü, plan durumu, anlık maliyet. Yazarak yönlendir, durdur. Biten koşu aynı ekranda tekrar izlenir |
| Koşular  | Geçmiş koşular, süre, maliyet, yeni / bilinen / bastırılan bulgu sayıları                                                                                                                                                          |
| Bulgular | Kök nedene göre tek kayıt, sayfa başına görünümler; kutuyla işaretli kanıt; senaryo, beklenen, gözlenen; karar + yorum; tarihçe; Markdown (şablonla, görüntülerle) / CSV / JSON dışa aktarma; JSON içe aktarma                     |
| Hafıza   | Kurallar (onay bekleyen, devrede, emekli; kaynak ve kullanım), öneriler, istem bütçesi, düz metin düzenleyici, müşteri Excel'i içe aktarma, Öğren / Bakım                                                                          |
| Ayarlar  | Durum, bağlantı denetimi, uygulama kullanıcıları, model ve efor, bütçe, öğrenme politikası                                                                                                                                         |

## Kontrolcü nasıl çalışır

Sayfa başına:

1. **Araştırma (token yok):** sayfa açılır, ağ susana kadar beklenir. `?` ipuçları okunur (tanımlar). Belirlenimci
   gözler bakar: ham değer, GUID, ham tarih/dönem, renk kodu, çeviri anahtarı, kesik metin ve yer tutucu, deseni olan
   kurallar, konsol hataları, başarısız istekler. Her biri kutulu kanıtla, kesin olarak kaydedilir.
2. **Plan (1 çağrı):** sıkıştırılmış sayfa ağacı + ekran + ipuçları + göz bulguları + ilgili kurallar + bu sayfadaki
   açık sorunlar → en çok N görev.
3. **Görevler:** her görev ayrı ve kısa bir konuşma (bağlam büyümez). Kontrolcü tıklar, üzerine gelir, filtre ve
   arama alanlarına yazar, kaydırır, gerektiğinde ekran görüntüsü ister; her etkileşimden sonra gözler yeniden bakar.
4. **Doğrulama:** bildirilen bulgunun alıntısı ekranda aranır; yoksa "doğrulanamadı" notuna iner. Sorunlu öğe
   kutuyla işaretlenip ekran görüntüsü alınır.
5. **Gruplama:** aynı kök neden (anahtar) uygulama genelinde tek sorundur; başka sayfada görülünce görünüm eklenir.

**Salt okur.** Yazma işi anlatan düğmeye ("Kaydet", "Sil", "Onaya gönder", "Oluştur"…) basmaz; veriyi değiştiren
istekler (PUT/PATCH/DELETE, satır yazan POST) ağdan geçmez; kontrolcü bir alana yazdıktan sonra sayfa açılışında
görülmemiş POST uçları da engellenir. Kalan risk: etiketi masum ("Tamam") olup açılışta görülmüş bir uca yazan
düğme. Bu yüzden yalnız development ve dallarda koşulur; production listelenmez.

## Öğrenme ve güvenlik

- **Ham bilgi isteme girmez.** Kararlar ve müşteri satırları ders çıkarıcıdan geçip kısa kurallara dönüşür; istem
  yalnız onaylı kuralları, kapsamına göre (platform → uygulama → modül → sayfa) ve token bütçesi içinde taşır.
  Bütçeyi aşan olursa akışta görünür, Bakım önerir.
- **Asimetrik güven.** "Sorun ara" kuralı ayara göre kendiliğinden devreye girebilir (en kötü ihtimalle fazladan bir
  bulgu gelir). "Sorun sayma" kuralı ve devredeki bir kuralı değiştiren her öneri insan onayı bekler: görmezden
  gelmeyi öğrenmek tehlikelidir.
- **Geri alınabilir.** Her kural kaynağını taşır. Kural emekliye ayrılınca onun bastırdığı sorunlar yeniden görünür.
  "Bulgu değil" kararı yalnız o sorunu susturur, kayıtlar silinmez ("bastırılanlar" süzgeci). Düzeldi denen sorun
  yeniden görülürse kendiliğinden açılır. Karar dosyaları Git'te olduğu için her değişiklik geri alınabilir.
- **Kendini düzeltir.** Kontrolcü yanlış bildirdiğini anlarsa bulguyu geri alır; alıntısı ekranda olmayan bulgu
  kesin sayılmaz; açılışta görülen göz sorunu bir sonraki koşuda yoksa "düzeldi" olur.

## Maliyet

Model ayarlardan seçilir (varsayılan `claude-opus-5-5`). Sabit talimat önbelleğe alınır; ekran görüntüsü isteğe
bağlıdır; ağaçtaki tekrar eden satırlar özetlenir; gözler token harcamaz. Her koşunun maliyeti ve token kullanımı
monitörde ve Koşular'da görünür. 1. sürüm ölçümü: sayfa başına yaklaşık $0,3–1,3.

## Takımla kullanım

`memory/` Git'tedir: kararlar, yorumlar, kurallar ve biçimler commit'lenir; pull alan herkes aynı hafızayı kullanır.
Pull sonrası **Hafıza → Dosyalar → Yenile** kararları yerel aynaya işler (koşu başında da kendiliğinden okunur).
Yerel veri (`data/`: koşular, görüntüler, ayarlar) Git'e girmez.

## Komutlar

| Komut           | Ne                                                                    |
| --------------- | --------------------------------------------------------------------- |
| `pnpm dev`      | Arayüz (5300) + sunucu (5301)                                         |
| `pnpm start`    | Arayüzü derleyip tek porttan (5300) sunar                             |
| `pnpm check`    | Lint + tür denetimi (arayüz dahil) + birim testleri                   |
| `pnpm test:e2e` | Sahte zeyrek-mcp + sahte Studio + senaryolu modelle uçtan uca testler |

## Klasörler

| Klasör                | Ne                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `server/src/platform` | zeyrek-mcp (yalnız okuyan araçlar), katalog, sayfa adresi, platform girişi, bağlantı denetimi |
| `server/src/browser`  | Tarayıcı oturumu (Türkçe, korumalar, canlı görüntü), gözler, ipuçları, ağaç sıkıştırma, kanıt |
| `server/src/agent`    | Model, istemler, araçlar, sayfa denetleyicisi (araştırma → plan → görev → doğrulama)          |
| `server/src/memory`   | Hafıza dosyaları, bütçeli kural seçimi, ders çıkarıcı, bakım, müşteri Excel'i, çıktı biçimi   |
| `server/src/issues`   | Sorun ve görünüm kaydı, karar, yorum, bastırma, yeniden açma, Git eşitlemesi                  |
| `server/src/runs`     | Koşu sırası ve yürütme, olay yolu                                                             |
| `server/src/api`      | HTTP uçları ve SSE akışı                                                                      |
| `ui/`                 | Svelte 5 arayüz                                                                               |
| `shared/`             | Sunucu ile arayüzün ortak türleri                                                             |
| `memory/`             | Git'te paylaşılan hafıza                                                                      |
