import { validateFields, type FieldError } from './validation'

/**
 * Yeni koşu ekranının saf mantığı: başlatma doğrulaması. Koşunun kapsamı girdiden çıkar (sayfalar koşu başında girdiye
 * göre seçilir); derinlik seçilmez, motor kalite öncelikli çalışır (bkz. `RUN_CEILINGS`).
 */

/**
 * Koşuyu başlatmaya engel olan alan hataları (Başlat düğmesi hep etkindir; tıklanınca alanlarda ve formun üstündeki
 * listede gösterilir). Girdi ya da ek gerekir (girdinin sınırı yoktur, uzun istem yapıştırılabilir); yükleme sürerken
 * ekler koşuya giremez.
 */
export function startErrors(input: { brief: string; files: number; uploading: boolean }): FieldError[] {
  return validateFields([
    {
      id: 'girdi',
      label: 'Girdi',
      value: input.brief,
      required: input.files ? false : 'Ne test edileceğini yaz ya da dosya ekle.',
    },
    {
      id: 'ekler',
      label: 'Ekler',
      value: '',
      check: () => (input.uploading ? 'Dosyalar yükleniyor; bitince koşuyu başlat.' : null),
    },
  ])
}
