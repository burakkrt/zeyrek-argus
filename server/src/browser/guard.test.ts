import { describe, expect, it } from 'vitest'
import {
  acceptsDialog,
  endpointKey,
  isUnsafeLabel,
  isUnsafeTarget,
  isWriteRequest,
  judgeRequest,
  type GuardState,
} from './guard.ts'

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
  const state = (): GuardState => ({
    loadPosts: new Set(),
    loading: true,
    dirty: false,
    identity: false,
    reserved: new Set(),
  })

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

  it('kimlik isteği serbest ama serbest listeye girmez; ayrılmış uç gezintide açılışta bile geçmez', () => {
    const s = state()
    const start = 'http://s/api/qm/m/web/sy-super-login-start'
    s.reserved.add(endpointKey('POST', start))
    s.identity = true
    expect(judgeRequest(s, 'POST', start, true)).toEqual({ allow: true })
    expect(s.loadPosts.size).toBe(0)
    s.identity = false
    expect(judgeRequest(s, 'POST', start, true)).toMatchObject({ allow: false })
    s.loading = false
    expect(judgeRequest(s, 'POST', start, true)).toMatchObject({ allow: false })
  })

  it('uç anahtarı kimlik parçalarını ayırmaz', () => {
    expect(endpointKey('post', 'http://s/a/123/b/0191abcd-1234-4abc-8def-1234567890ab?x=1')).toBe(
      'POST /a/:id/b/:id',
    )
  })
})

describe('isUnsafeTarget', () => {
  it('etiket kuralı düğmeye ve kısa etikete uygulanır; uzun satır metnindeki "silinecek" veridir', () => {
    expect(isUnsafeTarget('Sil', true)).toBe(true)
    expect(isUnsafeTarget('Sil', false)).toBe(true)
    expect(isUnsafeTarget('Seçili kayıtları toplu olarak kalıcı biçimde sil', true)).toBe(true)
    expect(
      isUnsafeTarget(
        'TEST-SIHIRBAZ geç yayın denemesi (ajan, silinecek)DD-2026-07 Beyaz yaka — Kapandı',
        false,
      ),
    ).toBe(false)
  })
})

describe('acceptsDialog', () => {
  it('uyarı ve sayfadan çıkış onayı kabul edilir; silme, gönderme ve giriş penceresi iptal', () => {
    expect(acceptsDialog('beforeunload', '')).toBe(true)
    expect(acceptsDialog('alert', 'Bilgi')).toBe(true)
    expect(acceptsDialog('confirm', 'Girilen bilgiler kaydedilmedi. Sayfadan çıkılsın mı?')).toBe(true)
    expect(acceptsDialog('confirm', 'Kaydedilmemiş değişiklikler kaybolacak, kayıt silinsin mi?')).toBe(false)
    expect(acceptsDialog('confirm', 'Bu kayıt silinsin mi?')).toBe(false)
    expect(acceptsDialog('confirm', 'Onaya gönderilsin mi?')).toBe(false)
    expect(acceptsDialog('prompt', 'Ad girin')).toBe(false)
  })
})
