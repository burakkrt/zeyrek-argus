/**
 * Sayfa açılış yüklemesi (Zeyrek sayfa kabının `isLoading` hâli): sayfa değişince içerik gizlenir, sayfanın açılışta
 * başlattığı okuma istekleri bitince birlikte görünür. Böylece veri parça parça gelirken içerik zıplamaz.
 *
 * `begin` sayfa değişiminde çağrılır. Açılış penceresi açıkken başlayan istekler `track` ile sayılır; sonuncusu
 * bitince (başarılı ya da hatalı) yükleme kapanır. Sayfa hiç istek atmazsa yükleme bir sonraki turda kapanır.
 * Pencere kapandıktan sonra başlayan istekler (yenileme, yoklama) sayfayı gizlemez. Svelte store sözleşmesine
 * uyar: bileşende `$pageLoad`.
 */
export class PageLoad {
  private loading = false
  private pending = 0
  private generation = 0
  private readonly listeners = new Set<(loading: boolean) => void>()

  constructor(private readonly defer: (fn: () => void) => void = (fn) => setTimeout(fn, 0)) {}

  begin() {
    const generation = ++this.generation
    this.pending = 0
    this.set(true)
    this.defer(() => {
      if (generation === this.generation && this.pending === 0) this.set(false)
    })
  }

  track<T>(promise: Promise<T>): Promise<T> {
    if (!this.loading) return promise
    const generation = this.generation
    this.pending++
    const settle = () => {
      if (generation !== this.generation) return
      this.pending--
      if (this.pending === 0) this.set(false)
    }
    promise.then(settle, settle)
    return promise
  }

  subscribe(listener: (loading: boolean) => void): () => void {
    this.listeners.add(listener)
    listener(this.loading)
    return () => this.listeners.delete(listener)
  }

  private set(loading: boolean) {
    if (this.loading === loading) return
    this.loading = loading
    for (const listener of this.listeners) listener(loading)
  }
}

export const pageLoad = new PageLoad()
