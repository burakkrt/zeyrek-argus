# AGENTS.md — Zeyrek Argus

Bu depoda çalışan yapay zekâ ve geliştirici için bağlayıcı kurallar. Ne olduğu: [README.md](README.md).

## Değişmez ilkeler

1. **production'a asla yazılmaz.** Kullanıcının seçtiği ortamda ya da dalda (development, feature dalları) MCP ile
   okunur ve test verisi yazılır; yazma yalnız veri/çalıştırma araçlarıyladır, uygulamanın tanımı değiştirilmez. MCP istemcisi (`server/src/platform/mcp.ts`) okumada sunucunun `readOnlyHint: true` işaretli
   araçlarını, yazmada yalnız `WRITE_TOOLS` listesini (kayıt yazma, süreç/akış/mikroservis çalıştırma, önizleme) çağırır;
   `DENIED_TOOLS` (kimlik bilgisi, kişisel veri) ikisinde de kapalı. Sayfa, varlık, akış/süreç tanımı, yayın, dağıtım,
   kullanıcı ve yetki araçları listeye eklenmez: Argus test ettiği uygulamayı değiştirmez. Kapı
   `server/src/platform/reader.ts`: ortam koşununkine sabitlenir, production koşusunda yazma kapalıdır (kullanıcı kararı
   2026-11-15: test verisi oluşturabilmek sağlıklı testin koşulu). Tarayıcıda yazma korumaları (`server/src/browser/guard.ts`) testle kanıtlıdır; gevşetilmez. production'a
   koşulmaz.
2. **Karar kanıta bağlıdır.** Bulgu türü: kesin (görüldü), tutarsızlık (neyle çeliştiği yazılı), not (bulgu
   sayılmaz). Alıntısı ekranda bulunmayan bulgu kesin olamaz. Tanımı okuyarak çıkarılan ama çalıştırılmayan iddia
   şüphedir (not), bulgu sayılmaz (`DefinitionFinding.dogrulama`). Her bulgu önem taşır (S1–S4, `SEVERITIES`); liste
   önce kritikleri gösterir. Giriş ekranında kalan ya da başka sayfaya yönlenen
   (kimliksiz açılan kayıt sayfası) sayfaya "bakılamadı" denir; model çağrılmaz, bulgu yazılmaz.
3. **Görmezden gelmeyi öğrenmek insan onayı ister.** `sorun-degil` kuralı ve devredeki kuralı değiştiren öneri
   kendiliğinden uygulanmaz (`server/src/memory/learn.ts`). Kural emekliye ayrılınca bastırdıkları serbest kalır.
4. **Ham bilgi isteme girmez.** Kararlar ve müşteri satırları ders çıkarıcıdan geçer; istem yalnız onaylı kuralları
   bütçe içinde taşır (`server/src/memory/select.ts`). Sayfa bilgisi de damıtılmış ve sabit bütçelidir
   (`server/src/agent/knowledge.ts`, `KNOWLEDGE_LIMITS`); her koşuda baştan yazılır, birikmez. Test yöntemleri
   (`memory/brain/test/`, insan yazar) planlayıcının seçtiği kadarıyla ve `GUIDE_LIMITS` bütçesiyle girer
   (`server/src/memory/guides.ts`). Yeni bir bilgi kaynağı isteme eklenecekse bütçesi ve kesme kuralıyla eklenir.
5. **Argus'un zekası `memory/brain/`'dedir, kodda değil.** Rolün ne yaptığı ve neye dikkat ettiği
   `memory/brain/roles/<rol>.md`'ye, testin nasıl yapılacağı (öncelik, neye bakılır, ne bulgu sayılmaz, önem)
   `memory/brain/test/`'e yazılır; kod yalnız dosyayı okur, yer tutucuyu doldurur ve veriyi ekler
   (`server/src/memory/roles.ts`). Kodda kalan metin yalnız mekanizmadır: araç ve şema açıklaması, güvenlik iletisi,
   araç sonucu. Uygulamanın öğrendikleri `memory/apps/`'tedir. Kullanıcı kararı 2026-11-17: zekayı klasörden okuyup
   geliştirebilmek.
6. **Konuşma geçmişi düzenlenmez.** Görev konuşmaları yalnız eklenerek büyür; bağlamı sınırlamanın yolu görevleri
   kısa tutmaktır (önbellek ve düşünme blokları korunur).

## Yapı

- `shared/` türleri sunucu ve arayüz ortak kullanır; olay biçimi değişirse ikisi birlikte değişir.
- Paylaşılan bilgi `memory/` dosyalarındadır (Git); yerel veri `data/argus.db` (SQLite), `data/runs/`, talimat görselleri `data/ekler/` (planlayıcıya yalnız koşunun kendi ekleri gider; gezgin görmez). Yerel veri toplam boyutla sınırlanır (`server/src/runs/storage.ts`): aşılınca üç günde bir bildirim, silme yalnız kullanıcı isteyince; `memory/` hiç silinmez.
- `memory/` altında Git çakışması çıkmaz: Argus'un yazdığı paylaşılan dosyalar kişi başınadır (`findings/<kimlik>.md`, `pages/<sayfa>/<kimlik>.md`), karar dosyalarını yalnız insan yazar ve `memory/.gitattributes` onları union ile birleştirir. Yeni bir paylaşılan dosya türü eklerken ya tek yazarlı yap ya da birleşmesini tanımla ve test et.
- **Motor değişikliği ölçülmeden varsayılan olmaz:** aynı sayfalarda ardışık koşu serisi, bulgular kanıt görüntüsüyle kör
  doğrulanır; kabul ölçütü yakalanan gerçek sorunun düşmemesi, yanlış bulgunun artmaması. Görev/adım/bütçe sınırıyla
  tasarruf yapılmaz. Ölçümü kaybeden kod aynı işte silinir.
  Karar dosyası kaynaktır; veritabanı aynadır (`IssueService.syncFromMemory`).
- Sayaçlar (kural kullanımı) dosyaya değil veritabanına yazılır.
- Kod adları İngilizce; arayüz, hata mesajı, hafıza ve doküman Türkçe. Model araçlarının adları Türkçedir (akışta
  görünür).
- İç paketler derlenmez; göreli içe aktarmalar `.ts` uzantılıdır.

## Kurallar

- Yeni belirlenimci göz: `server/src/browser/eyes.ts` + `DEFINITIONS` + `server/test/support/site.ts`'te kusurlu
  örnek + uçtan uca testte beklenti. Kural desenle çözülebiliyorsa göz yerine hafızaya desenli kural yazılır.
- **Kimlik koşudan önce, modelsiz belirlenir** (`server/src/identity/plan.ts`): istenen hesap, yoksa varsayılan hesap,
  hiç hesap yoksa platform jetonu; istenen hesap kayıtlı değilse koşu modelsiz durur. Hesaplar uygulama başına çok,
  biri varsayılan (`app_accounts`, yalnız bu makinede). Yeni kimlik yolu (süper giriş gibi) plana yeni tür olarak
  eklenir; koşu yöneticisi yalnız planı uygular.
- **Süper giriş** uygulamanın kendi akışıdır; sözleşmesi kodda değil uygulama hafızasında (`memory/apps/<p>/<u>/kimlik.md`:
  uçlar, hedef alanı, kişi listesi, isteğin sayfası, jeton alanı, çerez). Dosya yoksa süper giriş hiç denenmez. İstekler
  çalışma anı başlıklarıyla gider (`runtimeHeaders`; başlıksız istek 403), dönen jeton istemci olarak oturum çerezine
  yazılır, koşu sonunda hata olsa da kapatılır. Süper giriş uçları gezintide ayrılmıştır (`guard.reserved`): kontrolcü
  menüden kendiliğinden kullanıcı değiştiremez. Saklanan oturum hep asıl hesabındır.
- Uygulama oturumu koşular arasında saklanır (`data/oturumlar/`, hesap başına dosya 0600, Git dışı; platform jetonu
  yazılmaz): her koşu yeniden giriş yapmaz, süresi dolunca yeniden girilir. Parola değişince, hesap silinince ya da
  giriş tutmayınca saklanan oturum silinir; bozuk dosya koşuyu düşürmez. Kanıt: `controller.test.ts`.
- Model sağlayıcısı iki yoldur: API anahtarı (`agent/model.ts`) ya da Claude hesabı (`agent/subscription.ts`, resmi
  Agent SDK, kullanıcının kendi Claude Code oturumu). **Claude.ai kimlik bilgisine dokunulmaz:** jeton okunmaz,
  saklanmaz, iletilmez, giriş Argus'ta sunulmaz (Anthropic kuralı). İkisi de aynı `CreateMessage` sözleşmesini uygular;
  motor sağlayıcıyı bilmez.
- Model çağrısı yalnız `CreateMessage` üzerinden, rolüyle; testler senaryolu sahte modelle koşar, gerçek API'ye
  gitmez. Koşunun her model çağrısı ve platform okuması `data/runs/<id>/iz/iz.jsonl`'e yazılır (`runs/trace.ts`);
  koşu sonrası inceleme oradan yapılır.
- Koşunun yapısı: anla (`agent/strategist.ts`) → tanım kalemleri (`agent/investigator.ts`) ve sayfa kalemleri
  (`agent/page-controller.ts`) → gözetmen (`agent/supervisor.ts`); ortak araç döngüsü `agent/tool-loop.ts`. Sınır
  kapsamı daraltmak için konmaz; yalnız kaçağı (aynı işlemin tekrarı, ilerlemesizlik) durdurur.
- `pnpm check` ve `pnpm test:e2e` yeşil olmadan iş bitmiş sayılmaz.
- Sürümler tam sabitlenir; kullanılmayan bağımlılık eklenmez.
- Commit'i insan atar.

## Arayüz

- **Kalıp Zeyrek platformunun kabuğudur** (IMS Cortex): ölçü ve renk kaynağı Zeyrek App reposundaki
  `docs/apps/qm/kabuk-ve-tasarim-standardi.md` §1, §2, §5. Yeni bir kalıp kararı önce orada aranır; Argus'ta tahminle
  ölçü yazılmaz.
- Kit shadcn-svelte (Bits UI + Tailwind v4), grafik LayerChart. Font Geist + Geist Mono (IMS Cortex'in fontu, pakete
  gömülü). İkon IMS Cortex'in dili: menü ikonları Phosphor Duotone, menü daraltma Phosphor `sidebar-simple`, arayüz
  işaretleri (ok, arama, kapat …) Material Symbols Outlined. Yalnız `ui/src/lib/icons.ts`'te içe aktarılan SVG pakete
  girer, bileşen `Icon` ile çizer; başka ikon paketi eklenmez. Parçalar `ui/src/lib/components/` altındadır: `ui/` (shadcn; form ve
  menü kiti henüz kullanılmayan parçalarıyla birlikte), `layout/` (kabuk ve sayfa kalıbı), `form/` (alan, aramalı
  seçim, ek alanı), `table/` (ortak veri tablosu), `status/` (durum etiketleri).
- Renk: zemin `#F3F4F6`, kart beyaz, kenar `#E5E7EB`, form kenarı `#D8DBE0`, metin `#18181B` / `#52525B`. Vurgu tek
  mavi (`--brand` `#0C66E4`); seçili öğe açık mavi zemin + kenar + koyu mavi yazı. Durum renkleri (`--success`,
  `--warning`, `--destructive`, `--info`) yalnız durum bildirir; etiket ve uyarıda `success` / `warning` / `error` /
  `info` türleri. Renkler `ui/src/app.css`'teki değişkenlerdir; sayfada ve bileşende renk kodu yazılmaz.
- Ölçü: kök 16 px, gövde 14 px. Düğme ve giriş 38 px (varsayılan), araç çubuğu 32 px (sm), 28 px (xs), 40 px (lg);
  düğme 14/600, yan dolgu 24 px. Köşe: düğme/giriş 10, kart 14, durum etiketi tam yuvarlak (22 px, renkli nokta).
- Kabuk: kenar menü IMS Cortex menüsünün birebir karşılığıdır (`AppSidebar.svelte`; ölçüler Zeyrek App reposunda
  `zeyrek-frontend/packages/ng-apps-ui/src/components/navigations/`, görünüm IMS Cortex ekranıyla yan yana denetlenir):
  264 px, 64 px şeride daralır (tercih çerezde). Başlık üst çubukla aynı 56 px; daraltma düğmesi başlığın sağında
  yalnız ikon, şeritte açma düğmesi başlık çizgisiyle kenarın kesiştiği 24 px yuvarlak. "Menüde ara…" kutusu (`/`).
  Satır 40 px, panelden 8 px içeride, sol dolgu 10.4, ikon 18 (yazı renginde), ikon-etiket 10, 14 px; ağırlık üst
  düzey 500, alt sayfa 400, aktif sayfa ve aktif yol 600. Üzerine gelince açık gri; aktif sayfa açık mavi zemin + koyu
  yazı + mavi ikon. Modül akordeondur (tek açık, 180 ms, ok döner); alt sayfalar 28 px girintili, kılavuz çizgili.
  Grup başlığı büyük harf 11.2/500 soluk; üstte Kalite kontrol, dipte Sistem (`placement: 'bottom'`). Şeritte satır
  48×44 ortalı, ikon 22.5, modül yana açılan panelde, grup başlığı yerine ayraç. Menü ağacı `nav.ts`. Üst çubuk 56 px
  yapışkan (iz 14 px ikincil renk "/" ayraçlı; sağda 36 px Ctrl+K arama). `Page`: üst çubuğun altında yapışkan 68 px
  başlık şeridi (başlık 22/600/28, açıklama 12.5/18 ikincil, sağda eylemler) ve içerik kapsayıcısı (en çok 1480 px,
  28/24 px dolgu, bölüm aralığı 20 px). Sayfa değişince içerik, açılış okuma istekleri bitene kadar gizlenir ve içerik
  alanının görünen kısmının ortasında spinner döner (`page-load.ts`; platformun sayfa kabı yükleniyor hâli). Sayfa
  kendi yükleniyor yazısını çizmez. İçerik `Grid` içinde `StatCard` / `Panel`; boş durum
  `EmptyState` (kesik çizgili kutu). Menü, iz, komut paleti ve sekme başlığı `ui/src/lib/nav.ts`'ten okunur: iz hep
  "Ana sayfa" ile başlar (uygulama adı izde değil, menü dibindeki kartta), sekme başlığı "Sayfa | Zeyrek Argus". Sayfa kendi
  kenar boşluğunu, ızgarasını ya da kart çerçevesini yazmaz; yeni bir düzen gerekirse `layout/` altına eklenir.
- **Arayüz tek çalışma alanına odaklıdır** (proje · uygulama · dal; `server/src/workspace/workspace.ts`,
  `ui/src/lib/workspace.svelte.ts`). Sayfa kendi proje / uygulama / dal seçicisini çizmez; veriyi `runQuery()`
  (koşular, dala göre) ya da `appQuery()` (bulgu, hafıza; uygulamaya göre) ile süzer. Seçim açılışta sorulmaz:
  sunucu kayıtlıyı, yoksa tahmini verir; değişince sayfa ağacı `{#key}` ile baştan kurulur ve açık sekmeler
  `calisma-alani` olayıyla aynı seçime geçer. Seçicinin tek yeri menünün dibindeki `WorkspaceSwitcher`'dır.
- Tablo: her liste `table/DataTable` ile çizilir — Zeyrek platform tablosunun birebir görünümü (üstte mavi hap hazır
  süzgeçler; kart şeridinde kayıt özeti ve "Kolon ayarları" menüsü: tutamaç + işaret kutusu, sürükle-bırak, Sıfırla;
  büyük harf 40 px başlık; kolon altı süzgeç satırı, her kutu aynı 30 px / 12 px; 14 px hücre). Gelişmiş filtre yoktur
  (kullanıcı kararı, 2026-11-14: yük). Mantık `lib/table.ts`'tedir; ölçüler bileşenin başındaki yorumda.
- Ek alanı: `form/Attachments` — platformun kompakt sürükle-bırak eki (boşken tek satır, dolunca sayaç + Dosya ekle +
  kartlar). Mantık `lib/attachments.ts`.
- Koşu kodu `KOS-<yıl>-<sıra>` yalnız `createRun`'da atanır (`db/runs.ts` › `nextRunCode`); Yeni koşu `/kosular/siradaki-kod`'u
  önizler, ayırmaz. Kayıttan açılan sayfa adını `lib/page-name.svelte.ts`'e yazar; iz ve sekme başlığı onu gösterir.
- Bildirim: `notify.success|info|warning|error(başlık, açıklama)` (`lib/notify.svelte.ts`); kartları `Page` başlık
  şeridinin hemen altında sağda `layout/Notifications` çizer (platform outlined toast: beyaz kart, tonda ikon, geri sayım
  çizgisi, üzerine gelince durur, kapat; aynı bildirim tekrar gelirse ×n). Sayfa içi kırmızı Alert yerine bunu kullan.
- Yazı Inter (kod JetBrains Mono), Google Fonts; yer tutucu her girdide `text-placeholder` (#94A3B8); odak çerçevesi
  ince (2 px, %15).
- Form: her kontrol `Field` ile sarılır (etiket, zorunlu işareti, açıklama, hata; etikete tıklamak açılır menüyü
  açmaz, odaklar). Seçim için yerel `<select>` kullanılmaz: aramalı `Combobox` / `MultiCombobox` (Türkçe harf
  duyarlı süzgeç), kısa sabit listede `Select`. Açılır menü standardı: açıkken tetik mavi kenar + halka; üzerine
  gelinen öğe gri, seçili öğe açık mavi + koyu mavi yazı (tik yok); listede çerçeveli arama kutusu, öğe 32 px.
  Seçenekler okunurken `loading`: tetik pasif, okun yerinde gri spinner.
- Pencere yalnız `layout/Modal` ile açılır: başlık 18/600, açıklama 14 (aralık 2), başlık bölümü 20/16/24 px dolgu,
  sağ üstte kapat, yalnız gövde kayar, alt çubuk 12/24 px dolgulu, sağa yaslı 38 px düğmeler (`footer`); genişlik
  `sm` / `md` / `lg`. Katman sırası: pencere `z-50`, açılır liste `z-[60]` (pencerede açılan liste üstte kalır).
- Monitör (`views/Monitor.svelte`; Stüdyo düzeni: `components/monitor/` Stage · PlayerBar · Tracks · FlowList; hesap
  `lib/monitor.ts`: eylem cümlesi `actionOf`, şeritler `buildLanes`) ek model çağrısı
  yapmaz: anlatı modelin verdiği "neden", kayıt ve hedef kutusu sunucunun modelsiz ölçümüdür. Kayıt, ekran yayınının
  kareleridir (en çok ~10/sn, son kare hep iletilir): `runs/<id>/kare/<epoch-ms>.jpg`, giriş ve kimlik kurulurken
  yazılmaz; canlıda aynı kare SSE ile akar. Adımın `actAt`'ı (işlem anı) kayıtla aynı saattedir; imleç, tıklama halkası
  ve otomatik yakınlaştırma (`pointerAt`, `zoomAt`) buradan hesaplanır. Kayıtta model düşünürken geçen durgunluk
  `buildClock` ile kısaltılır; animasyonlar oynatma saatinde, canlıda gerçek saatte koşar (yoksa kısaltılan aralıkta
  sıçrar). Monitöre yeni bilgi eklenecekse önce olaylarda var mı bakılır; model çıktısı bunun için büyütülmez.
- Sayfanın açtığı tarayıcı penceresi kaydedilir ve adımın sonucuyla modele söylenir; yargıç da son adımları görür.
  Uyarı ve sayfadan çıkış onayı kabul edilir, iş onaylatan pencere iptal edilir (`acceptsDialog`). Çıkış onayını iptal
  etmek kontrolcüyü formda kilitledi, kalan bütün görev ve sayfalar düştü (KOS-2026-0035; `isolation.test.ts`).
  Dinleyicisiz Playwright pencereyi sessizce kapatır ve düğme "tepkisiz" sanılır (`controller.test.ts`).
- Yükleme: kısa işlemde gri `Spinner` (sm/md/lg; tek biçim, IMS Cortex yükleyicisi gibi), yeri belli içeriğin ilk
  yüklemesinde aynı ölçüde `Skeleton`
  (`ui/skeleton`; içerik gelince yer değişmez, zıplama olmaz — örnek `WorkspaceSwitcher`).
- shadcn bileşeni `pnpm dlx shadcn-svelte@1.7.2 add <ad> --no-deps-install` ile eklenir. CLI canlı kayıttan çeker ve
  sürümleri değiştirir: `package.json` elle tam sürüme geri sabitlenir; bileşenin Lucide ikonları `Icon`'a çevrilir.
  Durum varyantları (`data-open`, `data-checked` …) `app.css`'te bits-ui'nin `data-state` / `data-orientation`
  özniteliklerine eşlenir; yeni bir `data-*` varyantı gelirse oraya eklenir. `dark:` hiç eşleşmez (tek tema).
- `ui/src/lib/components/ui/` kopyalanmış koddur, lint dışındadır; ölçek, köşe, ikon ve durum türleri dışında
  değişiklik gerekirse satırına nedeni yazılır.
- Ekrandaki hesap (`overview.ts`, `format.ts`, `form/options.ts`) bileşende değil test edilen `.ts` modülündedir.
- Bir kalıp kararı değişince öncekinin izi aynı değişiklikte silinir (eski bileşen, paket, değişken, sınıf).
- `ui/src/legacy.css` geçiş katmanıdır: henüz taşınmamış sayfalar başlık şeridi olmadan `.legacy` içinde açılır. Sayfa
  taşınınca sarmalayıcı kaldırılır; son sayfa taşınınca dosya silinir.
