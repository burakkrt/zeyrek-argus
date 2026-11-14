import { describe, expect, it } from 'vitest'
import { findPerson, flowPath, parseSuperLogin, peopleOf, usersPath } from './super-login.ts'

const data = {
  super_giris_baslat: 'sy-super-login-start',
  super_giris_bitir: 'sy-super-login-stop',
  super_giris_hedef_alani: 'target_id',
  super_giris_kullanicilar: 'dashboard/sg_kullanici',
  super_giris_sayfa: 'dashboard',
  super_giris_jeton_alani: 'token',
  super_giris_cerez: 'SY_Token',
  super_giris_govde_page: 'dashboard',
  super_giris_govde_query: '{}',
}
const app = { project: 'qm', application: 'web' }

describe('süper giriş sözleşmesi', () => {
  it('hafızadaki ön bilgiden okunur; uç ve liste yolları kurulur', () => {
    const spec = parseSuperLogin(data)!
    expect(spec).toEqual({
      start: 'sy-super-login-start',
      stop: 'sy-super-login-stop',
      targetField: 'target_id',
      body: { page: 'dashboard', query: '{}' },
      users: 'dashboard/sg_kullanici',
      page: 'dashboard',
      tokenField: 'token',
      cookie: 'SY_Token',
    })
    expect(flowPath(app, spec.start)).toBe('/api/qm/m/web/sy-super-login-start')
    expect(usersPath(app, spec)).toBe('/api/qm/connect-data/web/dashboard/sg_kullanici/options')
  })

  it('dosya yoksa ya da alan eksikse süper giriş yok sayılır', () => {
    expect(parseSuperLogin({})).toBeNull()
    const { super_giris_bitir: _stop, ...missing } = data
    expect(parseSuperLogin(missing)).toBeNull()
    expect(parseSuperLogin({ ...data, super_giris_kullanicilar: '../kacak' })).toBeNull()
  })
})

describe('hedef kişi', () => {
  const people = peopleOf([
    { id: 'a1', full_name: 'Çetin KOCATÜRK' },
    { id: 'a2', full_name: 'Çetin Kişisel E Posta' },
    { id: 'a3', full_name: 'Ayşe Yılmaz' },
    { id: 'a4', full_name: 'Ayşe Yılmaz' },
    { bozuk: true },
  ])

  it('liste satırları kimlik ve görünen ada çevrilir, bozuk satır atlanır', () => {
    expect(people).toHaveLength(4)
    expect(people[0]).toEqual({ id: 'a1', label: 'Çetin KOCATÜRK' })
  })

  it('adla Türkçe harf duyarsız tam eşleşir ya da kimlikle bulunur', () => {
    expect(findPerson(people, 'çetin kocatürk')).toEqual({ person: { id: 'a1', label: 'Çetin KOCATÜRK' } })
    expect(findPerson(people, 'a2')).toEqual({ person: { id: 'a2', label: 'Çetin Kişisel E Posta' } })
  })

  it('aynı adda birden çok kişi varsa ya da kişi yoksa tahmin etmez', () => {
    expect(findPerson(people, 'Ayşe Yılmaz')).toEqual({
      error: '"Ayşe Yılmaz" adında 2 kişi var; kimliğiyle seçin (a3, a4).',
    })
    expect(findPerson(people, 'Çetin')).toEqual({ error: '"Çetin" süper giriş listesinde yok.' })
  })
})
