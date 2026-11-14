# AGENTS.md — Zeyrek Argus

Bu depoda çalışan yapay zekâ ve geliştirici için bağlayıcı kurallar. Ne olduğu: [README.md](README.md).

## Değişmez ilkeler

1. **Platforma yazılmaz.** MCP istemcisi yalnız `server/src/platform/mcp.ts` içindeki `READ_ONLY_TOOLS` listesini
   çağırır; liste yalnız okuyan araçla büyür. Tarayıcıda yazma korumaları (`server/src/browser/guard.ts`) testle
   kanıtlıdır; gevşetilmez. production'a koşulmaz.
2. **Karar kanıta bağlıdır.** Bulgu türü: kesin (görüldü), tutarsızlık (neyle çeliştiği yazılı), not (bulgu
   sayılmaz). Alıntısı ekranda bulunmayan bulgu kesin olamaz. Giriş ekranında kalan sayfaya "bakılamadı" denir.
3. **Görmezden gelmeyi öğrenmek insan onayı ister.** `sorun-degil` kuralı ve devredeki kuralı değiştiren öneri
   kendiliğinden uygulanmaz (`server/src/memory/learn.ts`). Kural emekliye ayrılınca bastırdıkları serbest kalır.
4. **Ham bilgi isteme girmez.** Kararlar ve müşteri satırları ders çıkarıcıdan geçer; istem yalnız onaylı kuralları
   bütçe içinde taşır (`server/src/memory/select.ts`). Yeni bir bilgi kaynağı isteme eklenecekse bütçesi ve kesme
   kuralıyla eklenir.
5. **Konuşma geçmişi düzenlenmez.** Görev konuşmaları yalnız eklenerek büyür; bağlamı sınırlamanın yolu görevleri
   kısa tutmaktır (önbellek ve düşünme blokları korunur).

## Yapı

- `shared/` türleri sunucu ve arayüz ortak kullanır; olay biçimi değişirse ikisi birlikte değişir.
- Paylaşılan bilgi `memory/` dosyalarındadır (Git); yerel veri `data/argus.db` (SQLite) ve `data/runs/`.
  Karar dosyası kaynaktır; veritabanı aynadır (`IssueService.syncFromMemory`).
- Sayaçlar (kural kullanımı) dosyaya değil veritabanına yazılır.
- Kod adları İngilizce; arayüz, hata mesajı, hafıza ve doküman Türkçe. Model araçlarının adları Türkçedir (akışta
  görünür).
- İç paketler derlenmez; göreli içe aktarmalar `.ts` uzantılıdır.

## Kurallar

- Yeni belirlenimci göz: `server/src/browser/eyes.ts` + `DEFINITIONS` + `server/test/support/site.ts`'te kusurlu
  örnek + uçtan uca testte beklenti. Kural desenle çözülebiliyorsa göz yerine hafızaya desenli kural yazılır.
- Model çağrısı yalnız `CreateMessage` üzerinden; testler senaryolu sahte modelle koşar, gerçek API'ye gitmez.
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
  seçim), `status/` (durum etiketleri).
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
- Form: her kontrol `Field` ile sarılır (etiket, zorunlu işareti, açıklama, hata; etikete tıklamak açılır menüyü
  açmaz, odaklar). Seçim için yerel `<select>` kullanılmaz: aramalı `Combobox` / `MultiCombobox` (Türkçe harf
  duyarlı süzgeç), kısa sabit listede `Select`. Açılır menü standardı: açıkken tetik mavi kenar + halka; üzerine
  gelinen öğe gri, seçili öğe açık mavi + koyu mavi yazı (tik yok); listede çerçeveli arama kutusu, öğe 32 px.
  Seçenekler okunurken `loading`: tetik pasif, okun yerinde gri spinner.
- Pencere yalnız `layout/Modal` ile açılır: başlık 18/600, açıklama 14 (aralık 2), başlık bölümü 20/16/24 px dolgu,
  sağ üstte kapat, yalnız gövde kayar, alt çubuk 12/24 px dolgulu, sağa yaslı 38 px düğmeler (`footer`); genişlik
  `sm` / `md` / `lg`. Katman sırası: pencere `z-50`, açılır liste `z-[60]` (pencerede açılan liste üstte kalır).
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
