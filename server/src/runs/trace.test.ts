import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Message } from '../agent/model.ts'
import { RunTrace, scrub } from './trace.ts'

let dir: string
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

const reply = {
  content: [{ type: 'text', text: 'tamam' }],
  usage: { input_tokens: 3 },
  stop_reason: 'end_turn',
}

describe('koşu izi', () => {
  it('görsel ve belge verisi yer tutucuya çevrilir, metin olduğu gibi kalır', () => {
    const data = 'A'.repeat(4096)
    expect(
      scrub([
        { type: 'text', text: 'Ekran' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } },
      ]),
    ).toEqual([
      { type: 'text', text: 'Ekran' },
      { type: 'image', data: '[görüntü 3 KB]' },
      { type: 'document', data: '[belge 3 KB]' },
    ])
  })

  it('her çağrı rolüyle, yalnız son mesajıyla yazılır; aynı talimat bir kez, hata da kaydedilir', async () => {
    dir = mkdtempSync(join(tmpdir(), 'argus-iz-'))
    let fail = false
    const trace = new RunTrace(dir)
    const model = trace.wrap(async () => {
      if (fail) throw new Error('kota doldu')
      return reply as unknown as Message
    })
    const params = (last: string) => ({
      model: 'claude-sonnet-5-5',
      max_tokens: 10,
      system: 'TALİMAT',
      messages: [
        { role: 'user' as const, content: 'ilk' },
        { role: 'user' as const, content: last },
      ],
    })
    await model(params('birinci'), 'explorer')
    await model(params('ikinci'), 'explorer')
    fail = true
    await expect(model(params('üçüncü'), 'judge')).rejects.toThrow('kota doldu')
    const lines = readFileSync(join(dir, 'iz', 'iz.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines.map((l) => l.t)).toEqual(['talimat', 'model', 'model', 'model'])
    expect(lines[1]).toMatchObject({ role: 'explorer', girdi: { content: 'birinci' }, yanit: reply.content })
    expect(JSON.stringify(lines[1])).not.toContain('"ilk"')
    expect(lines[3]).toMatchObject({ role: 'judge', hata: 'kota doldu' })
  })
})
