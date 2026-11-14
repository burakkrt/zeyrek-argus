import { describe, expect, it } from 'vitest'
import { PageLoad } from './page-load'

function setup() {
  const deferred: Array<() => void> = []
  const load = new PageLoad((fn) => deferred.push(fn))
  const states: boolean[] = []
  load.subscribe((value) => states.push(value))
  const flush = () => deferred.splice(0).forEach((fn) => fn())
  return { load, states, flush }
}

function pending() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('PageLoad', () => {
  it('istek atmayan sayfada yükleme bir sonraki turda kapanır', () => {
    const { load, states, flush } = setup()
    load.begin()
    expect(states).toEqual([false, true])
    flush()
    expect(states).toEqual([false, true, false])
  })

  it('açılış istekleri bitene kadar yükleme sürer, hatalı biten de sayılır', async () => {
    const { load, states, flush } = setup()
    const first = pending()
    const second = pending()
    load.begin()
    load.track(first.promise)
    load.track(second.promise).catch(() => undefined)
    flush()
    first.resolve()
    await tick()
    expect(states.at(-1)).toBe(true)
    second.reject(new Error('500'))
    await tick()
    expect(states.at(-1)).toBe(false)
  })

  it('pencere kapandıktan sonra başlayan istek sayfayı gizlemez', async () => {
    const { load, states, flush } = setup()
    load.begin()
    flush()
    const later = pending()
    load.track(later.promise)
    expect(states).toEqual([false, true, false])
    later.resolve()
    await tick()
    expect(states).toEqual([false, true, false])
  })

  it('önceki sayfanın geç biten isteği yeni sayfanın yüklemesini kapatmaz', async () => {
    const { load, states, flush } = setup()
    const old = pending()
    load.begin()
    load.track(old.promise)
    flush()
    const current = pending()
    load.begin()
    load.track(current.promise)
    flush()
    old.resolve()
    await tick()
    expect(states.at(-1)).toBe(true)
    current.resolve()
    await tick()
    expect(states.at(-1)).toBe(false)
  })
})
