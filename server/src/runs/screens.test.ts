import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MAX_SCREENS, ScreenMemory } from './screens.ts'

let dir: string
const fresh = () => (dir = mkdtempSync(join(tmpdir(), 'argus-ekran-')))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('ekran haritası', () => {
  it('her kişi kendi dosyasına yazar; okurken herkesinki birleşir, aynı ekranda en yeni not kazanır', () => {
    fresh()
    new ScreenMemory(dir, 'ali').remember('abc', 'Sayfa açıldı', ['eski'], '2026-11-14T00:00:00Z')
    new ScreenMemory(dir, 'burak').remember('abc', 'Sayfa açıldı', ['yeni'], '2026-11-15T00:00:00Z')
    new ScreenMemory(dir, 'burak').remember('def', 'Pencere', ['p'], '2026-11-15T01:00:00Z')
    const merged = new ScreenMemory(dir, 'cem')
    expect(merged.get('abc')?.notes).toEqual(['yeni'])
    expect(merged.get('def')?.label).toBe('Pencere')
    // Ali'nin dosyasına başkası dokunmadı.
    expect(Object.keys(JSON.parse(readFileSync(join(dir, 'ali.json'), 'utf8')))).toEqual(['abc'])
  })

  it('kişinin dosyası en yeni ekranlarla sınırlı kalır; bozuk dosya koşuyu düşürmez', () => {
    fresh()
    const memory = new ScreenMemory(dir, 'ali')
    for (let i = 0; i < MAX_SCREENS + 5; i += 1)
      memory.remember(
        `e${String(i).padStart(3, '0')}`,
        'Ekran',
        [],
        new Date(Date.UTC(2026, 10, 15, 0, 0, i)).toISOString(),
      )
    const own = JSON.parse(readFileSync(join(dir, 'ali.json'), 'utf8')) as Record<string, unknown>
    expect(Object.keys(own)).toHaveLength(MAX_SCREENS)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bozuk.json'), '{bozuk')
    expect(new ScreenMemory(dir, 'cem').get('e084')).not.toBeNull()
    expect(new ScreenMemory(dir, 'cem').get('e000')).toBeNull()
  })
})
