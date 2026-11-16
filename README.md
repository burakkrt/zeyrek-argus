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
cp .env.example .env      # ARGUS_ZEYREK_APP_DIR satırını doldur (API anahtarı isteğe bağlı)
pnpm dev                  # http://localhost:5300
```

**Model sağlayıcısı (Ayarlar → Yapay zekâ ve öğrenme):**
- **Claude hesabı (abonelik, varsayılan):** bu bilgisayarda Claude Code'a kendi hesabınla giriş yapmış olman yeter
  (bir terminalde `claude` → `/login`). Koşular planının kullanım hakkından düşer. Argus, Anthropic'in resmi Claude
  Agent SDK'sıyla Claude Code üzerinden çağırır; oturum jetonunu okumaz, saklamaz, iletmez. Oturum yoksa ya da süresi
  dolduysa koşu ve **Hesabı denetle** ne yapılacağını söyler. Kullanım sınırı dolarsa koşu nedenini söyleyerek durur.
- **API anahtarı:** `.env`'deki `ANTHROPIC_API_KEY` ile; maliyet dolar olarak yazılır.

Anthropic'in kuralı uygulamaların Claude.ai girişini kendisinin sunmasını ve kimlik bilgisine aracılık etmesini yasaklar;
izin verilen, kullanıcının değiştirilmemiş Claude Code'a kendi aboneliğiyle girmesidir. Argus bu yüzden girişi hiç
yapmaz, yalnız kullanıcının kendi açtığı Claude Code oturumunu kullanır. Takım genelinde kullanmadan önce kuralın
güncel hâline bakılmalıdır: <https://code.claude.com/docs/en/legal-and-compliance.md>.

Platform adresi, kuruluş ve kullanıcı Argus'ta yazılmaz; `zeyrek-mcp/.env`'den okunur. Uygulama kendi giriş
ekranını gösteriyorsa (kompleks proje) **Ayarlar → Uygulama kullanıcıları**'ndan hesap ekle; birden çok hesap
eklenebilir, biri varsayılandır ve her koşu onunla girer (Yeni koşu özette gösterir, seçtirmez). Hesaplar ve saklanan oturumlar
yalnız bu bilgisayarda (`data/`) durur, Git'e girmez: klonlayan ekip arkadaşı kendi hesabını ekler. Hesap yokken
koşu platform jetonuyla açılır; uygulama giriş isterse koşu model çağrılmadan durur ve ne yapılacağını söyler. Uygulamanın hafızasında süper giriş tanımlıysa (`kimlik.md`) koşu seçeneği `user` ile
hesabı olmayan bir kişiye varsayılan hesaptan süper girişle geçilebilir, koşu sonunda kapatılır; parola gerekmez.

## Ekranlar

Arayüz tek bir **çalışma alanına** (proje · uygulama · dal) odaklanır; menünün üstündeki karttan değiştirilir. Seçim
sunucuda kalır: açılışta son seçim, hiç seçim yoksa son koşunun ya da tek proje/uygulamanın development dalı açılır;
soru yalnız bunlar çıkarılamazsa sorulur. Koşular dala, bulgular ve hafıza uygulamaya göre süzülür.

| Ekran     | Ne yapar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ana sayfa | Son 14 gün: açık bulgu, koşu, sayfa başı maliyet ve süre; günlük yeni bulgu grafiği; türe göre açık bulgular; son koşular (açılış ekranı)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Yeni koşu | Girdi (ne test edilsin; sayfa bağlantısı yapıştırılırsa o sayfa seçilir) ve ekler (en çok 6: görsel, PDF, Excel, Word, CSV, metin; yalnız planlayıcıya gider — görsel ve PDF kendi bloğuyla, gerisi metne çevrilip); sayfa tablosu (dalın sayfaları MCP'den canlı; son koşu ve açık bulgu sayısı; hazır süzgeç, kolon süzgeci, kolon ayarları; sayfalama, varsayılan 20). Girdi ve sayfa ikisi de isteğe bağlı ama biri gerekir: yalnız sayfa → olağan kapsam; yalnız girdi → sayfalar girdiden seçilir; ikisi → seçilen sayfalar girdi bağlamında. Derinlik seçilmez (kalite öncelikli; bkz. Öğrenen motor). Başlıkta hep etkin Koşuyu başlat; dal ve varsayılan test kullanıcısı özeti; bu dalın son koşularından süre ve maliyet tahmini                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Monitör   | Koşu video gibi izlenir (Stüdyo düzeni): tarayıcının sürekli kaydı (~10 kare/sn) ekranı dolduran çalışma alanında (sayfa kaymaz, zaman çizelgesi laptopta da görünür) gri tuvalin üstünde pencere gibi; üstünde başlık, tarayıcı adresi ve durum şeridi, sağda her zaman açık akış paneli (görev grupları, tek satırlık adımlar, oynatmayla eşzamanlı kayar, kaydırınca "Şu ana dön"); üstünde yumuşak hareketli imleç, tıklama halkası ve hedefe otomatik yakınlaştırma. Hemen altında oynatma çubuğu (10 sn geri · oynat/duraklat · 10 sn ileri, eylem kartı "Tıkladı · “Vazgeç”" + neden, bulgu gezgini, hız 0,5×–4×, bu anın bağlantısı `?t=`, tam ekran) ve görev · adım · bulgu şeritleri; oynatma çizgisi hepsini keser, şeride tıklayıp sürükleyerek gezilir, adımın üstünde küçük kare ipucu. Canlıda ekran durgunken ne olduğu yazar ("Yapay zekâ sonraki adımı seçiyor"); bulguda durunca yeri videoda çerçevelenir; yarıda kalan koşunun sonunda nedeni çıkar. Videoya tek tık oynat/duraklat, sağ/sol yarıya çift tık 10 sn ileri/geri. Kısayollar (YouTube gibi): Boşluk/K, ←/→ 5 sn, J/L 10 sn, Shift+←/→ adım, B bulgu, F tam ekran. Sağda tek panelde okunur akış (bütün olaylar; satıra tıklayınca o ana gider) ya da bulgunun ayrıntısı (nasıl bulundu, beklenen/görülen, kanıt, yargıç gerekçesi). Model düşünürken geçen bekleme kayıtta kısaltılır. Yönlendir, durdur |
| Koşular   | Dalın koşuları ortak tabloda: kod (`KOS-<yıl>-<sıra>`, koşu başlatılınca atanır; Yeni koşu yalnız önizler), sayfalar, durum, tarih, süre, maliyet, yeni bulgu; hazır süzgeç, kolon süzgeci, arama, sayfalama; satır koşu detayını açar (iz ve sekme başlığında koşu kodu)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bulgular  | Kök nedene göre tek kayıt, sayfa başına görünümler; kutuyla işaretli kanıt; senaryo, beklenen, gözlenen; karar + yorum; tarihçe; Markdown (şablonla, görüntülerle) / CSV / JSON dışa aktarma; JSON içe aktarma                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Hafıza    | Kurallar (onay bekleyen, devrede, emekli; kaynak ve kullanım), öneriler, istem bütçesi, düz metin düzenleyici, müşteri Excel'i içe aktarma, Öğren / Bakım                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Ayarlar   | Genel: durum ve adın, bağlantı denetimi, uygulama kullanıcıları, yerel depolama · Yapay zekâ ve öğrenme: modeller, efor, koşu varsayılanları, öğrenme politikası · Hafıza                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Kontrolcü nasıl çalışır

**Koşu: anla → araştır → gözet → cevapla.**

- **Anla (girdili koşu):** güçlü model isteği çözümler ve gerekirse uygulamanın tanımlarını platformdan okur
  (akış, süreç, mikroservis, sayfa şeması, varlık…). Sonra koşunun stratejisini yazar: isteğin türü (arayüz taraması,
  kural/akış sorusu, karışık), test senaryoları, kapsamın tamam sayılma ölçütü, tanımdan bilinenler ve bu koşuda
  yapılamayanlar. İş kalemleri de burada çıkar; her kalemin kaynağı **tanım**
  (platform okuması), **ekran** (tarayıcı, bir sayfada) ya da **ikisi**dir (tanımı oku, sonucu ekranda teyit et). Sayfa
  seçilmediyse kalemlerin sayfalarını bu adım seçer. Girdisiz koşuda (yalnız sayfa seçildi) bu adım atlanır ve
  seçilen sayfalar baştan sona taranır.
- **Araştır:** tanım kalemleri tarayıcı açılmadan, yalnız platform okumasıyla ve kaynaklı cevaplanır; sonuçları
  sonraki ekran kalemlerine geçer. Ekran kalemleri ilgili sayfada birer görevdir. Gezginin araç kutusunda tarayıcı
  araçlarıyla birlikte platform okuması da vardır: aynı görevde tanımı okuyup ekranda teyit edebilir. Yalnız tanım
  kalemi olan koşu tarayıcı açmaz.
- **Gözet:** kalemler bitince gözetmen sonucu başarı ölçütüyle karşılaştırır; cevap eksikse ve kanıt toplanacak yol
  kaldıysa ek kalem ister (en çok bir tur).
- **Cevapla:** koşunun "Cevap"ı (cevaplandı / kısmen / cevaplanamadı, cevap, kanıtlar, eksik kalan) koşu kaydında
  ve izleme ekranında akışın üstünde durur; bulgular bunun altındadır.
- **Platform okuması** yalnız sunucunun "salt okuma" (`readOnlyHint`) işaretli araçlarıyla yapılır; kimlik bilgisi ve
  kişisel veri döndüren araçlar kara listededir; ortam her okumada koşunun ortamına sabitlenir.
- **Platforma yazma** (`platform_yaz`, araştırmacı ve gezgin) koşunun ortamında (kullanıcının seçtiği development ya da
  dal; production'da asla) ve yalnız veri ve çalıştırma araçlarıyla yapılır: test kaydı oluşturmak/güncellemek/silmek, süreç, akış ve mikroservis çalıştırmak, önizlemeler.
  Ekranda yapılamayan senaryo (aşama ilerletme, kayıt doğrulaması, onay zinciri) böyle test edilir. Uygulamanın tanımını
  değiştiren araçlar (sayfa, varlık, akış tanımı, yayın, dağıtım, kullanıcı, yetki) kapalıdır; production koşusunda
  yazma yoktur. Model kendi test kaydını "Argus test" diye işaretler, işi bitince siler; silmeyi unuttuğu ya da silemediği
  kayıtları (`row_create` ile oluşturulanlar) koşu sonunda kapı siler. Her yazma akışta ve izde görünür.

Sayfa başına:

1. **Araştırma (token yok):** sayfa açılır, ağ susana kadar beklenir. `?` ipuçları okunur (tanımlar). Belirlenimci
   gözler bakar: ham değer, GUID, ham tarih/dönem, renk kodu, çeviri anahtarı, kesik metin ve yer tutucu, deseni olan
   kurallar, konsol hataları, başarısız istekler. Her biri kutulu kanıtla, kesin olarak kaydedilir.
2. **Plan:** stratejinin bu sayfadaki kalemleri birer görevdir. Sayfa baştan sona taranacaksa planlayıcı (1 çağrı)
   sıkıştırılmış ağaç + ekran + ipuçları + göz bulguları + kurallar + açık sorunlardan sayfanın görevlerini de çıkarır.
   Her görev sayfanın temiz hâlinden başlar (önceki görevin formu, penceresi bulaşmaz).
3. **Görevler (gezgin):** her görev ayrı ve kısa bir konuşma (bağlam büyümez). Gezgin tıklar, üzerine gelir, filtre
   ve arama alanlarına yazar, kaydırır; her etkileşimden sonra belirlenimci gözler yeniden bakar. Uzun sayfada gezgine
   ağacın kaydırma konumuna karşılık gelen bölümü gider (aşağı kaydırınca alt bölümün öğelerini görür ve tıklar). Gezginin işi görevin
   her maddesine ulaşmak ve davranış sorunlarını (tepki vermeyen düğme, açılmayan pencere, çalışmayan filtre)
   bildirmektir; ulaşamadığı madde olursa bir üst modele geçer.
4. **Göz:** gezginin ulaştığı her yeni ekranın (ağaç belirgin biçimde değiştiyse; ekran sayısına sınır yok, aynı
   ekran iki kez incelenmez) o anki hâli yakalanır ve Opus onu gezgini bekletmeden inceler: veri tutarlılığı, adlar,
   sayaçlar, başlık ve açıklama, görsel sorunlar. Göz sayfanın tamamını görür: ilk incelenen ekranın tam ağacı önbellekli
   taban olur, sonraki ekranlar ona göre fark olarak gider. Her incelemenin kısa **ekran notları** (yalnız yeni durum adları,
   sayaçlar, "kısmi" işaretleri; en çok 8) sonraki incelemeye taşınır; böylece ekranlar arası tutarsızlık da görülür.
   Kanıt görüntüsü sayfanın tamamını kapsar (pencere içerik boyuna geçici büyütülür, iç kutuda kayan uygulamada da), bulgu
   üstüne kutuyla çizilir; yer tutucu, ipucu ve erişilebilir ad metni de kanıtta aranır.
   **Terim gözü:** sayfanın sonunda incelenen ekranların etiketleri (başlık, sütun, sekme, durum…) geçtikleri ekranlarla
   tek çağrıda karşılaştırılır; aynı kavramın farklı adla geçtiği yer bulunur (ekran ekran bakan gözün kaçırdığı tür).
5. **Doğrulama:** bildirilen bulgunun alıntısı ekranda aranır; yoksa "doğrulanamadı" notuna iner. Gezginin bildirdiği
   aday kayda girmeden **yargıca** (Opus) gider: kabul eder, nota indirir ya da reddeder; bilinen bir sorunsa
   anahtarını eşler.
6. **Gruplama:** aynı kök neden (anahtar) uygulama genelinde tek sorundur; başka sayfada görülünce görünüm eklenir.
   Yargıç, araştırmacı ve gözetmen bulgu kaydederken bu koşuda kaydedilmiş ve modülde bilinen sorunları (tanım bulguları
   dahil) anahtarıyla görür; aynı kök nedense yeni sorun açmaz, o anahtara ekler. Yargıç adayı gezginin gördüğü pencereyle
   ve görüntüyle denetler.

**Tarayıcıda salt okur.** Yazma işi anlatan düğmeye ("Kaydet", "Sil", "Onaya gönder", "Oluştur"…) basmaz; veriyi değiştiren
istekler (PUT/PATCH/DELETE, satır yazan POST) ağdan geçmez; kontrolcü bir alana yazdıktan sonra sayfa açılışında
görülmemiş POST uçları da engellenir. Etiket kuralı düğmelere uygulanır; satır ve hücre metni veridir (adı "silinecek"
geçen kaydın satırı açılır). Sayfadan çıkış onayı ("kaydedilmedi, çıkılsın mı?") kabul edilir, kaydedilmemiş girdi yok
sayılır; silme ve gönderme onayı iptal edilir. Açılamayan sayfa boş sayfa üzerinden yeniden denenir. Kalan risk: etiketi masum ("Tamam") olup açılışta görülmüş bir uca yazan
düğme. Bu yüzden yalnız development ve dallarda koşulur; production listelenmez.

## Test yöntemleri

Testin nasıl yapılacağı `memory/test/` (bütün uygulamalar) ve `memory/apps/<p>/<u>/test/` (uygulama ve modül)
altındaki Markdown dosyalarındadır; takım Git'te geliştirir. Bugünkü yöntemler: `genel` (her koşuda: neyin bulgu
olduğu, öncelik sırası, test verisi), `akis` (bir işlemi baştan sona yapmak, hata yolları, sonucun veride
doğrulanması), `arayuz` (görünüm ve tutarlılık; seçilirse göz de çalışır), `kural`, `yetki`; uygulamada `performans` ve
`dif` (kritik akışlar). Planlayıcı isteğe göre seçer: "DİF talebini basitçe test et" → `genel + akis + dif`, göz kapalı;
girdisiz sayfa taraması → `genel + arayuz`. Seçilenler akışta ve kapsam kartında görünür. Biçim ve kurallar:
[memory/README.md](memory/README.md#test-yöntemleri).

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

Model rol başına seçilir (Ayarlar → Yapay zekâ ve öğrenme): planlayıcı (strateji ve gözetmen), göz, yargıç ve öğretmen
`claude-opus-5-5`; araştırmacı (tanım kalemleri) ve gezgin `claude-sonnet-5-5`. Tanım kalemleri koşunun en pahalı
kısmıydı (KOS-2026-0038: maliyetin %71'i, Opus'la 86 tur); kanıtını Opus gözetmen denetler.
Gezgin takılırsa (iki tur ilerleyemezse, yanıt reddedilirse) ya da görevin bir maddesine ulaşamazsa bir üst modele
geçer; göz açıkken en çok Sonnet'e (içeriği zaten Opus inceliyor), kapalıyken Opus'a. Ucuz model son kararı vermez.

**Öğrenen motor.** Her sayfa koşusunun sonunda öğretmen modeli sayfa bilgisini damıtır
(`memory/apps/<p>/<u>/pages/<sayfa>/<kimlik>.md`: amaç, ekranlar, güven dereceli beklentiler, kapsanan / kapsanmayan alanlar,
bulgu sayılmayan tuhaflıklar; liste başına üst sınırlı, ~1.500 token). Bilgi sonraki koşuda planlayıcıya, gezgine,
göze ve yargıca gider. Planlayıcı değişiklik izini de okur: sayfa değişmediyse bilinen alanı yeniden gezmez, kapsanmayan
alana ve güveni düşük beklentiye yönelir; değiştiyse önce değişikliğin etkileyebileceği yere. Göz, önceki koşuda
incelediği ekranı yeniden inceler: ölçümde aynı içerikli ekrana ikinci bakış her iki ekrandan birinde yeni bulgu çıkardı;
ekran atlamak kaliteden ödündü. Göz bir koşuda her ekrana bir kez bakar (yalnız odağı ya da 1-2 satırı değişen ekran
aynı sayılır) ve önceki ekranların notlarını önbellekten okur. Yeni öğrenme yoksa (sayfa aynı, bulgu yok) bilgi yeniden
yazılmaz. Görev, adım ya da bütçe sınırıyla
tasarruf yapılmaz: bulgu kaçırmak kaliteden ödündür. Koşunun derinliği kullanıcıya bırakılmaz; planlayıcı sayfanın tamamını
kapsayacak kadar görev, gezgin görevdeki her maddeyi bitirene kadar adım atar. Kaçağı (sonsuz döngü, takılma) şunlar
durdurur: aynı işlemin aynen tekrarı ilerleme sayılmaz; iki tur ilerleyemeyen gezgin üst modele geçer, en üst modelde de
4 tur ilerleyemezse görev bulgular bildirilerek kapanır; son çare güvenlik tavanı sayfa başına 20 görev, görev başına 150 adım
(`RUN_CEILINGS`). Kapanan görev akışta nedeniyle yazılır; gece bırakılan koşu sabaha maliyet patlatmaz.

**Ölçüm (2026-11-15; 3 sayfa × 3 ardışık koşu, temiz hafıza; bulgular kanıt görüntüsüyle kör doğrulandı, 24 gerçek
sorun):** öğrenen motor seri boyunca 22/24 gerçek sorunu buldu (önceki motor 13/24), koşu başı ortalama 5,2 (3,8); toplam
maliyet +%10, doğrulanmış sorun başı maliyet −%35 ($0,68 → $0,44); yanlış bulgu oranı aynı (~%40). Denenip elenenler:
göz Sonnet'le (sayfa bilgisiyle de 6/24), gözün bulgularını sayfa sonunda tek yargıç çağrısıyla elemek (gürültüyü
yarıya indirdi ama gerçek sorunları da attı, 14/24), sayfa sonunda ayrı sentez çağrısı (katkı yok). Gürültü insan
kararıyla ("bulgu değil") azalır, otomatik retle değil.

**Abonelik ölçümü (2026-11-15; aynı 3 sayfa, aynı veri, API karşılığı):** önceki kod 3 sayfada $26,8 harcıyor, 16/24
doğrulanmış sorunu buluyordu; maliyetin $20,9'u gözdü. Kök neden: gözün "önceki ekranların notları" her çağrıda tek metin
olarak yeniden yazılıyordu (74 ekranlı sayfada son çağrı 91 bin karakter not taşıdı; maliyet ekran sayısıyla karesel).
Sayfanın sabit bağlamı önbellekli talimatta, notlar ekran başına önbellekli blokta: $13,6, 18/24 (−%49). Sonra kaçan
6 sorunun kökü bulundu: ağaç 9 bin karakterde kesiliyordu, uzun sayfanın alt bölümü göze, gezgine ve yargıca hiç
gitmiyordu (karnenin "Tüm göstergeler" tablosu 17 incelemenin hiçbirinde yoktu) ve göz terim tutarlılığını kaçırıyordu.
Tam ağaç (göz için taban + fark), gezgine kaydırma penceresi, terim gözü ve not sınırıyla dönemler 4/4, karne 13-14/15;
maliyet gezilen alan büyüdüğü için arttı (dönemler $7,6 → $7,9, karne $3,6 → $7,3-8,9; yargıç gezginin penceresini görünce karnede yargıç maliyeti yarıya indi). Tam ağacı gezgine de vermek keşfi
genişletip karneyi $13,8'e çıkarıyordu; elendi. Aynı
sayfaların öğrenilmiş hafızayla ikinci koşusu ucuzlamadı ama yeni doğrulanmış sorunlar buldu; koşular arası ekran atlamak
(eski "seçici göz") ikinci bakışta çıkan bulguları kaçırttığı için kaldırıldı. Göz Sonnet'le karnede 12/15 → 7/15.

Maliyetin çoğu modele giden yeni içerikten (önbelleğe yazma) gelir; bu yüzden: görevin başında ağacın tamamı, her
etkileşimden ve ekrana bakıştan sonra yalnız değişen kısmı gider; ağaçta tekrar eden satırlar ve içi boş sarmalayıcılar
atılır; ekran görüntüsü yalnız istenince ve %60 ölçekte gider; planlayıcı görev sayısını sayfaya göre seçer (2..N),
görevler örtüşmez; modüldeki bilinen ve reddedilen sorun listesi her görevin başında değil yalnız yargıca gider; açık
sorunun alıntısı açılışta ekrandaysa model çağrılmadan doğrulanır (aynı koşuda sayfa yeniden açılınca yeniden kaydedilmez);
sayfanın sabit bağlamı (ipuçları, açık ve bilinen sorunlar, sayfa bilgisi) sayfa boyunca önbellekli talimattadır, gözün
büyüyen ekran notları önbellekli blokta; abonelikte bu işaretler Claude Code'un 1 saatlik süresiyle aktarılır; yargıcın
ve gözün tek seferlik içeriği (ekranın ağacı, görüntüsü) önbelleğe yazılmaz; göz yalnız belirgin biçimde değişen ekrana bakar; belirlenimci gözler token harcamaz. Kanıt görüntüleri (PNG, kutulu) modele gitmez. Koşunun maliyeti rol başına kaydedilir.

**Değişiklik izi:** her sayfa açılışında arayüz yapısı (maskeli ağaç), çağrılan veri uçları ve Studio sayfa şeması
(`page_schema_get`) özetlenip önceki koşuyla karşılaştırılır ve akışa yazılır; öğrenen motor planı ve göz buna göre
yönelir. Hiçbir alan modelsiz "geçti" sayılmaz.

## Takımla kullanım

`memory/` Git'tedir: kararlar, yorumlar, kurallar ve biçimler commit'lenir; pull alan herkes aynı hafızayı kullanır.
Pull sonrası **Hafıza → Dosyalar → Yenile** kararları yerel aynaya işler (koşu başında da kendiliğinden okunur).
Sayfa bilgisi ve açık bulgular da paylaşılır: bir kişinin koşusunun öğrendiği ötekinin koşusunu
yönlendirir, arkadaşın bulduğu sorun senin koşunda alıntısıyla (çoğu kez modelsiz) yeniden denetlenir ve bulgu ekranında
"Başka makinelerde görüldü" altında görünür. Git çakışması çıkmaz: bu dosyaları herkes yalnız kendi adına yazar
(`<kimlik>`), karar dosyaları Git'in union birleştirmesiyle birleşir (ayrıntı: [memory/README.md](memory/README.md)).
Kimlik elle girilmez: makinenin işletim sistemi kimliği ile oturumdaki kullanıcının özetidir (`m-` + 12 hane;
uygulama silinip kurulsa, depo yeniden indirilse de aynı kalır). Kararlarda ve yorumlarda görünen ad Git'in `user.name`
ayarıdır. İkisi de **Ayarlar → Genel → Bu makine**'de görünür.

Yerel veri (`data/`: koşu kayıtları, kanıt görüntüleri, ekler, ayarlar, hesaplar, oturumlar) Git'e girmez. Tek sınırı
toplam boyuttur (varsayılan 10 GB, **Ayarlar → Genel → Yerel depolama**). Sınır aşılınca uygulama açılışında üç günde
en çok bir kez bir şerit hatırlatır; kendiliğinden hiçbir şey silinmez. Temizle denince toplam sınırın %70'ine indirilir
(hemen ardından gelen koşu yeniden uyarı doğurmasın): önce kullanılmayan ekler, sonra en eski koşuların video kaydı ve
adım görüntüleri, yetmezse en eski kanıtlar; her bulgunun en son kanıtı, süren koşu ve veritabanı korunur. Paylaşılan
hafıza (`memory/`) bu hesaba girmez ve silinmez. Kaydı silinen koşunun akışı ve bulguları durur; izleme ekranı kaydın
neden olmadığını söyler.

## Komutlar

| Komut           | Ne                                                                    |
| --------------- | --------------------------------------------------------------------- |
| `pnpm dev`      | Arayüz (5300) + sunucu (5301)                                         |
| `pnpm start`    | Arayüzü derleyip tek porttan (5300) sunar                             |
| `pnpm check`    | Lint + tür denetimi (arayüz dahil) + birim testleri                   |
| `pnpm test:e2e` | Sahte zeyrek-mcp + sahte Studio + senaryolu modelle uçtan uca testler |

## Klasörler

| Klasör                | Ne                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/platform` | zeyrek-mcp (yalnız okuyan araçlar), katalog, sayfa adresi, platform girişi, bağlantı denetimi                                      |
| `server/src/browser`  | Tarayıcı oturumu (Türkçe, korumalar, canlı görüntü), gözler, ipuçları, ağaç sıkıştırma, kanıt                                      |
| `server/src/agent`    | Model, istemler, araçlar, sayfa denetleyicisi (araştırma → plan → görev → doğrulama)                                               |
| `server/src/memory`   | Hafıza dosyaları, bütçeli kural seçimi, ders çıkarıcı, bakım, müşteri Excel'i, çıktı biçimi                                        |
| `server/src/issues`   | Sorun ve görünüm kaydı, karar, yorum, bastırma, yeniden açma, Git eşitlemesi                                                       |
| `server/src/runs`     | Koşu sırası ve yürütme, olay yolu                                                                                                  |
| `server/src/api`      | HTTP uçları ve SSE akışı                                                                                                           |
| `ui/`                 | Svelte 5 arayüz: shadcn-svelte + Tailwind v4, Phosphor + Material Symbols, Geist, LayerChart; kalıp `ui/src/lib/components/layout` |
| `shared/`             | Sunucu ile arayüzün ortak türleri                                                                                                  |
| `memory/`             | Git'te paylaşılan hafıza                                                                                                           |
