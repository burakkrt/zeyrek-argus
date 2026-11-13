import { describe, expect, it } from 'vitest'
import { endpointKey, isUnsafeLabel, isWriteRequest, judgeRequest, type GuardState } from './guard.ts'

describe('isUnsafeLabel', () => {
  it.each([
    'Kaydet',
    'Kaydet ve kapat',
    'Sil',
    'Onaya gönder',
    'Yayınla',
    'Save',
    'İptal et',
    'Eğitim planı oluştur',
  ])('yazma düğmesi: %s', (label) => expect(isUnsafeLabel(label)).toBe(true))
  it.each(['Ayrıntılar', 'Yeni', 'Ekle', 'Filtrele', 'Kapat', 'İptal', 'Tesis', 'Kayıtlar', 'Rapor indir'])(
    'okuma düğmesi: %s',
    (label) => expect(isUnsafeLabel(label)).toBe(false),
  )
})

describe('isWriteRequest', () => {
  const base = 'http://site/api/qm/web/entities/e1'
  it('satır listeleyen POST okumadır, satır yazan POST yazmadır', () => {
    expect(isWriteRequest('POST', `${base}/row/list`)).toBe(false)
    expect(isWriteRequest('POST', `${base}/row`)).toBe(true)
    expect(isWriteRequest('POST', `${base}/row/bulk/delete`)).toBe(true)
    expect(isWriteRequest('PUT', `${base}/row`)).toBe(true)
    expect(isWriteRequest('delete', `${base}/row/42`)).toBe(true)
  })
})

describe('judgeRequest', () => {
  const state = (): GuardState => ({ loadPosts: new Set(), loading: true, dirty: false })

  it('açılışta görülen POST, form kirlendikten sonra da serbest; yeni uç engellenir', () => {
    const s = state()
    expect(judgeRequest(s, 'POST', 'http://s/api/microservice/liste/execute', true)).toEqual({ allow: true })
    s.loading = false
    s.dirty = true
    expect(judgeRequest(s, 'POST', 'http://s/api/microservice/liste/execute', true)).toEqual({ allow: true })
    expect(judgeRequest(s, 'POST', 'http://s/api/microservice/kaydet/execute', true)).toMatchObject({
      allow: false,
    })
  })

  it('form temizken yeni uç serbest (pencere açınca gelen veri yüklenir)', () => {
    const s = { ...state(), loading: false }
    expect(judgeRequest(s, 'POST', 'http://s/api/microservice/kisi-sec/execute', true)).toEqual({
      allow: true,
    })
  })

  it('uç anahtarı kimlik parçalarını ayırmaz', () => {
    expect(endpointKey('post', 'http://s/a/123/b/0191abcd-1234-4abc-8def-1234567890ab?x=1')).toBe(
      'POST /a/:id/b/:id',
    )
  })
})
