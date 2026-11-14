import type { AppUserSetting } from '@argus/shared'

/**
 * Koşunun kimlik planı: hangi hesapla girileceği koşu başlamadan, model çağrılmadan belirlenir.
 *
 * - `hesap`: uygulamanın giriş ekranından o hesapla girilir (saklanan oturum varsa giriş yapılmaz).
 * - `super`: istenen kişinin hesabı yok ama uygulamada süper giriş tanımlı (`kimlik.md`); varsayılan hesapla girilir,
 *   süper girişle o kişiye geçilir, koşu sonunda süper giriş kapatılır. Kişinin parolası gerekmez.
 * - `platform`: uygulamada kayıtlı hesap yok; platform jetonuyla açılır. Uygulama giriş ekranı gösterirse koşu
 *   modelsiz durur ve kullanıcıya hesap eklemesi söylenir (yeni klonda ilk koşu böyle başlar).
 * - `yok`: istenen kişiye hiçbir yoldan girilemiyor; koşu modelsiz durur, nedeni yazılır.
 *
 * Koşu yöneticisi planı uygular, hangi yolun seçildiğini bilmez; yeni bir kimlik yolu buraya yeni tür olarak eklenir.
 */
export type IdentityPlan =
  | { kind: 'hesap'; identifier: string }
  | { kind: 'super'; base: string; target: string }
  | { kind: 'platform' }
  | { kind: 'yok'; message: string }

export function planIdentity(
  requested: string | null | undefined,
  accounts: Pick<AppUserSetting, 'identifier' | 'isDefault'>[],
  superLogin: boolean,
): IdentityPlan {
  const base = accounts.find((a) => a.isDefault) ?? accounts[0]
  const wanted = requested?.trim()
  if (wanted) {
    const account = accounts.find((a) => a.identifier.toLowerCase() === wanted.toLowerCase())
    if (account) return { kind: 'hesap', identifier: account.identifier }
    if (superLogin && base) return { kind: 'super', base: base.identifier, target: wanted }
    return {
      kind: 'yok',
      message: superLogin
        ? `"${wanted}" kişisine süper girişle geçmek için önce bir hesap gerekir. Ayarlar › Uygulama kullanıcıları bölümünden süper giriş yetkisi olan bir hesap ekleyin.`
        : `"${wanted}" için kayıtlı hesap yok ve bu uygulamada süper giriş tanımlı değil. Ayarlar › Uygulama kullanıcıları bölümünden ekleyin.`,
    }
  }
  return base ? { kind: 'hesap', identifier: base.identifier } : { kind: 'platform' }
}
