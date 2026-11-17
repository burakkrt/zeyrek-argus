import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fill, parseRole, ROLE_IDS, roleBook } from './roles.ts'

const ROLES_DIR = join(import.meta.dirname, '../../../memory/brain/roles')

describe('rol talimatları', () => {
  it('ana metin ve parçalar ayrılır; yer tutucu doldurulur', () => {
    const doc = parseRole(
      '---\nkimlik: gozetmen\nrol: Gözetmen\naciklama: Kapsamı denetler\n---\nAna {{tur}}.\n\n## Parça: son-tur\nBu son tur.\n',
    )!
    expect(doc).toMatchObject({ id: 'gozetmen', title: 'Gözetmen', main: 'Ana {{tur}}.', parts: { 'son-tur': 'Bu son tur.' } })
    expect(fill(doc.main, { tur: 'kural' })).toBe('Ana kural.')
  })

  it('eksik ya da fazla yer tutucu ve eksik rol dosyası koşuyu nedeniyle durdurur', () => {
    expect(() => fill('Ana {{tur}}.')).toThrow('{{tur}}')
    expect(() => fill('Ana.', { tur: 'x' })).toThrow('{{tur}}')
    expect(() => roleBook([])).toThrow('memory/brain/roles/temel.md')
  })

  it("depodaki memory/brain/roles her rolü taşır; her dosyanın ön bilgisi tam", () => {
    const docs = readdirSync(ROLES_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => parseRole(readFileSync(join(ROLES_DIR, f), 'utf8'))!)
    expect(docs.every((d) => d && d.description && d.main)).toBe(true)
    expect(docs.map((d) => d.id).sort()).toEqual([...ROLE_IDS].sort())
    expect(() => roleBook(docs)).not.toThrow()
  })
})
