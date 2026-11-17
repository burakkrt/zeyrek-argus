import { describe, expect, it } from 'vitest'
import { BURST_MS, flowCards, operationIcon, plainCall } from './platform-steps'

const read = (tool: string, failed = false) => ({
  tool: 'platform_oku',
  outcome: `${failed ? 'Platformdan okunamadı' : 'Platformdan okundu'}: ${tool}`,
})
const write = (tool: string, failed = false) => ({
  tool: 'platform_yaz',
  outcome: `${failed ? 'Platforma yazılamadı' : 'Platforma yazıldı'}: ${tool}`,
})

describe('plainCall', () => {
  it('teknik aracı sade dile çevirir; okuma ve listeleme ayrılır', () => {
    expect(plainCall(read('workflow_get'))).toEqual({
      kind: 'oku',
      ok: true,
      title: 'İş akışını okudu',
      tool: 'workflow_get',
    })
    expect(plainCall(read('row_list')).title).toBe('Kayıtları listeledi')
    expect(plainCall(read('flow_get')).title).toBe('Sayfa akışını okudu')
    expect(plainCall(read('page_state', true))).toMatchObject({
      ok: false,
      title: 'Sayfa tanımını okuyamadı',
    })
    expect(plainCall(read('bilinmeyen_arac')).title).toBe('Tanımı okudu')
  })

  it('yazma ve çalıştırma ayrı türdür; başarısızlık başlıkta söylenir', () => {
    expect(plainCall(write('row_create'))).toMatchObject({ kind: 'yaz', title: 'Test kaydı oluşturdu' })
    expect(plainCall(write('row_delete', true))).toMatchObject({
      kind: 'yaz',
      ok: false,
      title: 'Test kaydını silemedi',
    })
    expect(plainCall(write('microservice_execute'))).toMatchObject({
      kind: 'calistir',
      title: 'Servisi çalıştırdı',
    })
    expect(plainCall(write('process_execute', true)).title).toBe('Süreci çalıştıramadı')
    expect(plainCall(write('query_preview')).title).toBe('Sorguyu önizlemeyle çalıştırdı')
  })
})

describe('flowCards', () => {
  const at = (s: number) => s * 1000
  const step = (seq: number, sec: number, base: { tool: string; outcome: string }) => ({
    seq,
    at: at(sec),
    ...base,
  })

  it('saniyeler içinde art arda gelen aynı tür adımlar tek karttır; başlık genelleşir', () => {
    const cards = flowCards([
      step(1, 0, read('workflow_get')),
      step(2, 1, read('workflow_get')),
      step(3, 2, read('page_state')),
      step(4, 3, write('row_create')),
    ])
    expect(cards.map((c) => [c.key, c.call.title, c.steps.length])).toEqual([
      [1, 'Tanımları okudu', 3],
      [4, 'Test kaydı oluşturdu', 1],
    ])
  })

  it('başarısız adım başarılılarla birleşmez; uzun ara yeni kart açar', () => {
    const cards = flowCards([
      step(1, 0, read('workflow_get')),
      step(2, 1, read('workflow_get', true)),
      step(3, 2 + BURST_MS / 1000, read('workflow_get', true)),
    ])
    expect(cards.map((c) => [c.call.ok, c.steps.length])).toEqual([
      [true, 1],
      [false, 1],
      [false, 1],
    ])
  })
})

describe('operationIcon', () => {
  it('önce modelin yazdığı işin anlamı, sonra araç belirler', () => {
    const run = { tool: 'platform_yaz', outcome: 'Platforma yazıldı: microservice_execute' }
    expect(operationIcon({ ...run, platform: { label: 'Anketi katılımcıya gönderme' } })).toBe('opSend')
    expect(operationIcon({ ...run, platform: { label: 'Test sorusu oluşturma' } })).toBe('opCreate')
    expect(operationIcon(run)).toBe('opService')
    expect(operationIcon(read('workflow_get'))).toBe('opFlow')
    expect(operationIcon(read('entity_get'))).toBe('opTable')
    expect(operationIcon(write('row_delete'))).toBe('opDelete')
    expect(operationIcon(read('bilinmeyen_arac'))).toBe('database')
  })
})
