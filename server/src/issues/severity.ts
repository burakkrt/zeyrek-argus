import { SEVERITIES, type Severity } from '@argus/shared'

/**
 * Önem tablosu: bulgu bildiren her şemanın `onem` alanına aynı metin gider. İç hata ayrıntısının sızması S2'dir: ham
 * veritabanı iletisiyle 500 dönen kayıt S3 sayılıyordu, oysa işlem çöküyor ve iç yapı kullanıcıya görünüyor.
 */
export const SEVERITY_GUIDE =
  'Önem: S1 veri kaybı/bozulması, yetki sızıntısı, yanlış puan/hesap, akış kilitleniyor; S2 kural ya da zorunlu alan ' +
  'atlatılıyor, geçersiz durum geçişi, işlem sunucu hatasıyla (500) çöküyor ya da iç hata ayrıntısı (veritabanı ' +
  'iletisi, yığın izi) kullanıcıya dönüyor, yanlış yönlendirme; S3 anlaşılmaz ya da yanıltıcı ileti, kötü hata ' +
  'yönetimi (geçici çözüm var); S4 görünüm, metin, biçim.'

/** Modelin verdiği önem (S1-S4); tanınmayan ya da boş değer orta önemdir (S3). */
export const severityOf = (value: unknown): Severity =>
  SEVERITIES.includes(value as Severity) ? (value as Severity) : 'S3'
