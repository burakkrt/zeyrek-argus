/**
 * Salt okuma korumaları. Kontrolcü bakar, gezer, filtre ve arama alanlarına yazabilir; ama veri değiştiremez.
 * Üç katman:
 *  1. Yazma işi anlatan düğmeye basılmaz (etiket).
 *  2. Veriyi değiştiren istek ağdan geçmez: PUT, PATCH, DELETE ve satır yazan POST.
 *  3. Kontrolcü bir alana yazdıktan sonra ("kirli form"), sayfa açılırken görülmemiş POST uçları da engellenir:
 *     form doldurup gönderme kalıbı budur. Açılışta görülen uçlar (listeler, sorgular) serbest kalır.
 */

const UNSAFE_LABEL =
  /(^|[^\p{L}])(kaydet|sil|kaldır|onayla|onaya|gönder|tamamla|yayınla|reddet|devret|iptal et|oluştur|save|delete|remove|submit|confirm|approve|send|publish|reject|create)/iu

/** Türkçe "İ" düzenli ifadenin büyük-küçük eşlemesine girmez; etiket iki kurala göre de küçültülüp bakılır. */
export function isUnsafeLabel(label: string): boolean {
  return [label.toLocaleLowerCase('tr'), label.toLowerCase()].some((form) => UNSAFE_LABEL.test(form))
}

/**
 * Etiket kuralı düğme gibi denetimlere ve kısa etiketlere uygulanır. Tablo satırı ya da hücrenin metni veridir: adı
 * "(silinecek)" geçen bir kaydın satırına tıklamak yazma değildir. Satıra tıklamanın yazdığı durumda ağ katmanı
 * (2 ve 3) yine geçirmez.
 */
export function isUnsafeTarget(label: string, control: boolean): boolean {
  return (control || label.length <= 30) && isUnsafeLabel(label)
}

const LEAVE_CONFIRM = /(sayfadan çık|çıkılsın|ayrıl|kaydedilmedi|kaydedilmemiş|kaybol|unsaved|leave)/u

/**
 * Tarayıcı penceresine yanıt: uyarı ve sayfadan çıkış onayı kabul edilir (kaydedilmemiş girdi yok sayılır, hiçbir şey
 * yazılmaz); silme, gönderme ya da başka bir işi onaylatan pencere iptal edilir. Çıkış onayını iptal etmek kontrolcüyü
 * formda kilitler: sonraki her görev ve sayfa açılamaz (KOS-2026-0035).
 */
export function acceptsDialog(type: string, message: string): boolean {
  if (type === 'alert' || type === 'beforeunload') return true
  return type === 'confirm' && LEAVE_CONFIRM.test(message.toLocaleLowerCase('tr')) && !isUnsafeLabel(message)
}

const WRITING_POST = /\/row(\/bulk(\/delete)?|\/reassign)?\/?$/

export function isWriteRequest(method: string, url: string): boolean {
  const verb = method.toUpperCase()
  if (verb === 'PUT' || verb === 'PATCH' || verb === 'DELETE') return true
  if (verb !== 'POST') return false
  return WRITING_POST.test(new URL(url).pathname)
}

const ID_SEGMENT = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i

/** Ucun kimliği: yöntem + yol (kimlik parçaları `:id`). Sorgu dizesi ve gövde dikkate alınmaz. */
export function endpointKey(method: string, url: string): string {
  const path = new URL(url).pathname
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/')
  return `${method.toUpperCase()} ${path}`
}

export interface GuardState {
  /** Sayfa açılışında görülen POST uçları. */
  loadPosts: Set<string>
  /** Açılış sürüyor mu (bu sırada görülen POST'lar serbest listeye girer). */
  loading: boolean
  /** Kontrolcü bir alana yazdı mı. */
  dirty: boolean
  /** Kimlik işi sürüyor (süper giriş başlat / bitir, kullanıcı listesi): istekler serbest, serbest listeye girmez. */
  identity: boolean
  /**
   * Gezintide hiç geçmeyen uçlar (süper giriş başlat / bitir): kullanıcı değiştirmek kimlik katmanının işidir, kontrolcü
   * menüden kendiliğinden başka kullanıcıya geçmesin.
   */
  reserved: Set<string>
}

export type GuardVerdict = { allow: true } | { allow: false; reason: string }

export function judgeRequest(
  state: GuardState,
  method: string,
  url: string,
  sameOrigin: boolean,
): GuardVerdict {
  if (isWriteRequest(method, url)) return { allow: false, reason: 'veri yazan istek' }
  if (method.toUpperCase() !== 'POST' || !sameOrigin) return { allow: true }
  const key = endpointKey(method, url)
  if (state.identity) return { allow: true }
  if (state.reserved.has(key))
    return { allow: false, reason: 'kullanıcı değiştiren uç (kimlik katmanının işi)' }
  if (state.loading) {
    state.loadPosts.add(key)
    return { allow: true }
  }
  if (state.dirty && !state.loadPosts.has(key))
    return { allow: false, reason: 'form doldurulduktan sonra yeni bir uca gönderim' }
  return { allow: true }
}
