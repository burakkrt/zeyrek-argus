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

| Ekran       | Ne yapar                                                                                                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Genel bakış | Son 14 gün: açık bulgu, koşu, sayfa başı maliyet ve süre; günlük yeni bulgu grafiği; türe göre açık bulgular; son koşular (açılış ekranı)                                                                                          |
| Başlat      | Proje → uygulama → ortam/dal → sayfalar (MCP'den canlı); görev ve adım sınırı; tahmini süre ve maliyet                                                                                                                             |
| Monitör     | Akış: araştırma, plan, görevler, her adım (neden + sonuç + küçük görüntü), ağ istekleri, bulgular. Yanında canlı tarayıcı görüntüsü, plan durumu, anlık maliyet. Yazarak yönlendir, durdur. Biten koşu aynı ekranda tekrar izlenir |
| Koşular     | Geçmiş koşular, süre, maliyet, yeni / bilinen / bastırılan bulgu sayıları                                                                                                                                                          |
| Bulgular    | Kök nedene göre tek kayıt, sayfa başına görünümler; kutuyla işaretli kanıt; senaryo, beklenen, gözlenen; karar + yorum; tarihçe; Markdown (şablonla, görüntülerle) / CSV / JSON dışa aktarma; JSON içe aktarma                     |
| Hafıza      | Kurallar (onay bekleyen, devrede, emekli; kaynak ve kullanım), öneriler, istem bütçesi, düz metin düzenleyici, müşteri Excel'i içe aktarma, Öğren / Bakım                                                                          |
| Ayarlar     | Durum, bağlantı denetimi, uygulama kullanıcıları, model ve efor, bütçe, öğrenme politikası                                                                                                                                         |

## Kontrolcü nasıl çalışır

Sayfa başına:

1. **Araştırma (token yok):** sayfa açılır, ağ susana kadar beklenir. `?` ipuçları okunur (tanımlar). Belirlenimci
   gözler bakar: ham değer, GUID, ham tarih/dönem, renk kodu, çeviri anahtarı, kesik metin ve yer tutucu, deseni olan
   kurallar, konsol hataları, başarısız istekler. Her biri kutulu kanıtla, kesin olarak kaydedilir.
2. **Plan (1 çağrı):** sıkıştırılmış sayfa ağacı + ekran + ipuçları + göz bulguları + ilgili kurallar + bu sayfadaki
   açık sorunlar → en çok N görev.
3. **Görevler (gezgin):** her görev ayrı ve kısa bir konuşma (bağlam büyümez). Gezgin tıklar, üzerine gelir, filtre
   ve arama alanlarına yazar, kaydırır; her etkileşimden sonra belirlenimci gözler yeniden bakar. Gezginin işi görevin
   her maddesine ulaşmak ve davranış sorunlarını (tepki vermeyen düğme, açılmayan pencere, çalışmayan filtre)
   bildirmektir; ulaşamadığı madde olursa bir üst modele geçer.
4. **Göz:** gezginin ulaştığı her yeni ekranın (ağaç belirgin biçimde değiştiyse, sayfa başına en çok 14) o anki hâli
   yakalanır ve Opus onu gezgini bekletmeden inceler: veri tutarlılığı, adlar, sayaçlar, başlık ve açıklama, görsel
   sorunlar. Her incelemenin kısa **ekran notları** (durum adları, sayaçlar, "kısmi" işaretleri) sonraki incelemeye
   taşınır; böylece ekranlar arası tutarsızlık da görülür. Bulgu, yakalanan görüntünün üstüne kutuyla çizilir.
5. **Doğrulama:** bildirilen bulgunun alıntısı ekranda aranır; yoksa "doğrulanamadı" notuna iner. Gezginin bildirdiği
   aday kayda girmeden **yargıca** (Opus) gider: kabul eder, nota indirir ya da reddeder; bilinen bir sorunsa
   anahtarını eşler.
6. **Gruplama:** aynı kök neden (anahtar) uygulama genelinde tek sorundur; başka sayfada görülünce görünüm eklenir.

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

Model rol başına seçilir (Ayarlar): planlayıcı, göz, yargıç ve öğretmen `claude-opus-5-5`, gezgin `claude-sonnet-5-5`.
Gezgin takılırsa (iki tur ilerleyemezse, yanıt reddedilirse) ya da görevin bir maddesine ulaşamazsa bir üst modele
geçer; göz açıkken en çok Sonnet'e (içeriği zaten Opus inceliyor), kapalıyken Opus'a. Ucuz model son kararı vermez.

**Ölçüm (2026-11-14, temiz hafıza, 3 sayfa, 15 koşu):** göz + Sonnet gezgin, tek Opus koşusuna göre gerçek sorunların
%68'ini buldu (Opus %41) ve Opus'un her koşuda bulduklarını da buldu; sayfa başı süre −%14, maliyet +%15, gerçek bulgu
başı maliyet −%31. Göz kapalıyken Haiku ya da Sonnet gezgin içerik çelişkilerini kaçırıyordu: göz kapatılırsa gezgin
Opus seçilmeli. Ekran notları olmadan göz ekranlar arası tutarsızlığı göremiyordu; sayfa sonunda ayrı bir sentez
çağrısı denendi, katkısı olmadığı için kaldırıldı.

Maliyetin çoğu modele giden yeni içerikten (önbelleğe yazma) gelir; bu yüzden: görevin başında ağacın tamamı, her
etkileşimden ve ekrana bakıştan sonra yalnız değişen kısmı gider; ağaçta tekrar eden satırlar ve içi boş sarmalayıcılar
atılır; ekran görüntüsü yalnız istenince ve %60 ölçekte gider; planlayıcı görev sayısını sayfaya göre seçer (2..N),
görevler örtüşmez; modüldeki bilinen ve reddedilen sorun listesi her görevin başında değil yalnız yargıca gider; açık
sorunun alıntısı açılışta ekrandaysa model çağrılmadan doğrulanır; yargıcın ve gözün tek seferlik içeriği önbelleğe
yazılmaz; göz yalnız belirgin biçimde değişen ekrana bakar; belirlenimci gözler token harcamaz. Kanıt görüntüleri (PNG, kutulu) modele gitmez. Koşunun maliyeti rol başına kaydedilir.

**Değişiklik izi (yalnız gözlem):** her sayfa açılışında arayüz yapısı (maskeli ağaç), çağrılan veri uçları ve Studio
sayfa şeması (`page_schema_get`) özetlenip önceki koşuyla karşılaştırılır ve akışa yazılır. Doğruluğu birkaç koşuda
ölçülmeden hiçbir alan "değişmedi" diye atlanmaz.

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

| Klasör                | Ne                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `server/src/platform` | zeyrek-mcp (yalnız okuyan araçlar), katalog, sayfa adresi, platform girişi, bağlantı denetimi                           |
| `server/src/browser`  | Tarayıcı oturumu (Türkçe, korumalar, canlı görüntü), gözler, ipuçları, ağaç sıkıştırma, kanıt                           |
| `server/src/agent`    | Model, istemler, araçlar, sayfa denetleyicisi (araştırma → plan → görev → doğrulama)                                    |
| `server/src/memory`   | Hafıza dosyaları, bütçeli kural seçimi, ders çıkarıcı, bakım, müşteri Excel'i, çıktı biçimi                             |
| `server/src/issues`   | Sorun ve görünüm kaydı, karar, yorum, bastırma, yeniden açma, Git eşitlemesi                                            |
| `server/src/runs`     | Koşu sırası ve yürütme, olay yolu                                                                                       |
| `server/src/api`      | HTTP uçları ve SSE akışı                                                                                                |
| `ui/`                 | Svelte 5 arayüz: shadcn-svelte + Tailwind v4, Phosphor + Material Symbols, Geist, LayerChart; kalıp `ui/src/lib/components/layout` |
| `shared/`             | Sunucu ile arayüzün ortak türleri                                                                                       |
| `memory/`             | Git'te paylaşılan hafıza                                                                                                |
