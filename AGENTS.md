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
