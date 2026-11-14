/**
 * Kayıttan açılan sayfanın adı (koşu detayında koşu kodu). Sayfa yükleyince yazar; iz ve sekme başlığı bunu gösterir
 * (`crumbsFor`, `documentTitle`). Adres değişince App sıfırlar.
 */
export const pageName = $state<{ current: string | null }>({ current: null })
