import { describe, expect, it } from 'vitest'
import { openDatabase } from './database.ts'
import { deleteAppUser, getAppUser, listAppUsers, saveAppUser } from './settings.ts'

const app = { project: 'qm', application: 'web' }

describe('uygulama hesapları', () => {
  it('ilk hesap varsayılan olur; yenisi varsayılan istenirse tek varsayılan kalır', () => {
    const db = openDatabase(':memory:')
    saveAppUser(db, app, 'onur@x', 'p1')
    saveAppUser(db, app, 'furkan@x', 'p2')
    expect(getAppUser(db, app)).toEqual({ identifier: 'onur@x', password: 'p1' })
    saveAppUser(db, app, 'furkan@x', null, true)
    expect(listAppUsers(db, app).map((a) => [a.identifier, a.isDefault])).toEqual([
      ['furkan@x', true],
      ['onur@x', false],
    ])
    // Parola boş gönderilirse eskisi kalır.
    expect(getAppUser(db, app, 'furkan@x')).toEqual({ identifier: 'furkan@x', password: 'p2' })
  })

  it('varsayılan silinince kalan hesap varsayılan olur; başka uygulamanın hesapları karışmaz', () => {
    const db = openDatabase(':memory:')
    saveAppUser(db, app, 'onur@x', 'p1')
    saveAppUser(db, app, 'furkan@x', 'p2')
    saveAppUser(db, { project: 'crm', application: 'web' }, 'ali@x', 'p3')
    deleteAppUser(db, app, 'onur@x')
    expect(listAppUsers(db, app)).toEqual([
      { project: 'qm', application: 'web', identifier: 'furkan@x', hasPassword: true, isDefault: true },
    ])
    expect(listAppUsers(db).length).toBe(2)
  })
})
