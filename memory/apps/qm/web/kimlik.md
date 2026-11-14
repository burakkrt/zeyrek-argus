---
super_giris_baslat: sy-super-login-start
super_giris_bitir: sy-super-login-stop
super_giris_hedef_alani: target_id
super_giris_kullanicilar: dashboard/sg_kullanici
super_giris_sayfa: dashboard
super_giris_jeton_alani: token
super_giris_cerez: SY_Token
super_giris_govde_page: dashboard
super_giris_govde_query: "{}"
---
IMS Cortex süper girişi (QM'nin kendi akışı, platform özelliği değil). Kayıtlı hesap `super_login` iznine sahipse
koşu istenen kullanıcıya geçer; Argus bu dosya olan uygulamada süper girişi dener, olmayanda hiç denemez.

- Başlat: `POST /api/qm/m/web/sy-super-login-start`, gövde `{ target_id, page, query }`; yanıt
  `{ token, success, redirect_url }`. **Çerezi sunucu yazmaz**: istemci `token`'ı `SY_Token` çerezine kendisi yazar,
  yazılmazsa kimlik değişmez ve süper giriş açık kalır (ölçüldü 2026-11-14). Bitir: `POST …/sy-super-login-stop`,
  gövde `{ page, query }`, `SY_Token` süper giriş jetonu olmalı; yanıttaki `token` asıl kullanıcınındır.
- İstekler çalışma anı başlıklarıyla gider (`x-environment`, `x-page`, `x-surface: runtime`); başlıksız istek 403
  döner (ölçüldü). `super_giris_sayfa` isteğin gönderildiği sayfadır (`x-page`).
- Hedef kimliği kullanıcı listesinden: `POST /api/qm/connect-data/web/dashboard/sg_kullanici/options`
  (`{ op: 'list' }`) → `{ data: { data: [{ id, full_name }] } }`.
- Süper girişte yazma istekleri QM'de loglanır (`sy_super_login_logs`); Argus gezintisi yazmaz, yalnız oturum açılır
  ve koşu sonunda kapatılır.
- Ölçüldü 2026-11-14 (Onur ÖZKARDEŞ → Çetin KOCATÜRK, `development`): giriş ve sonlandırma çalıştı.

Bu dosya isteme girmez; yalnız kimlik katmanı okur (`server/src/identity/`).
