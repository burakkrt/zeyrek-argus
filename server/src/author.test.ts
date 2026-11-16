import { describe, expect, it } from 'vitest'
import { authorId, detectAuthor, machineKey } from './author.ts'

describe('yazar kimliği', () => {
  it('makine ve kullanıcıdan kararlı, kısa ve ham değeri açık etmeyen bir kimlik üretir', () => {
    const id = authorId('0b6c2f9e-1111-2222-3333-444455556666', 'ayse')
    expect(id).toMatch(/^m-[0-9a-f]{12}$/)
    expect(authorId('0b6c2f9e-1111-2222-3333-444455556666', 'ayse')).toBe(id)
    expect(authorId('0b6c2f9e-1111-2222-3333-444455556666', 'burak')).not.toBe(id)
    expect(id).not.toContain('ayse')
  })

  it('bu makinede okunur ve her çağrıda aynıdır (kullanıcı belirlemez)', () => {
    expect(machineKey()).toBeTruthy()
    const first = detectAuthor(process.cwd())
    expect(first.id).toMatch(/^m-[0-9a-f]{12}$/)
    expect(first.name).toBeTruthy()
    expect(detectAuthor(process.cwd())).toEqual(first)
  })
})
