import { describe, expect, it } from 'vitest'
import type { Message } from './model.ts'
import { toolLoop } from './tool-loop.ts'

const respond = (uses: Array<{ name: string; input: unknown }>) =>
  ({ content: uses.map((u, i) => ({ type: 'tool_use', id: `t${i}`, ...u })) }) as unknown as Message

describe('araç döngüsü', () => {
  it('bitiş aracıyla sonucu döner; ara araçların cevabı modele gider', async () => {
    const seen: string[] = []
    let turn = 0
    const result = await toolLoop<string>({
      finishTool: 'bitir',
      ceiling: 10,
      first: [{ type: 'text', text: 'başla' }],
      call: async (messages) => {
        seen.push(JSON.stringify(messages.at(-1)))
        turn += 1
        return respond(
          turn === 1 ? [{ name: 'oku', input: { a: 1 } }] : [{ name: 'bitir', input: { cevap: 'tamam' } }],
        )
      },
      handle: async (name, input) =>
        name === 'bitir' ? { done: (input as { cevap: string }).cevap } : 'okundu',
    })
    expect(result).toBe('tamam')
    expect(seen[1]).toContain('okundu')
  })

  it('aynı çağrıyı tekrarlayan döngü tavandan önce durur; araçsız konuşma bir kez hatırlatılır', async () => {
    let calls = 0
    expect(
      await toolLoop({
        finishTool: 'bitir',
        ceiling: 100,
        first: [{ type: 'text', text: 'başla' }],
        call: async () => {
          calls += 1
          return respond([{ name: 'oku', input: { a: 1 } }])
        },
        handle: async () => 'aynı',
      }),
    ).toBeNull()
    expect(calls).toBeLessThanOrEqual(7)
    let talks = 0
    expect(
      await toolLoop({
        finishTool: 'bitir',
        ceiling: 100,
        first: [{ type: 'text', text: 'başla' }],
        call: async () => {
          talks += 1
          return { content: [{ type: 'text', text: 'düşünüyorum' }] } as unknown as Message
        },
        handle: async () => 'x',
      }),
    ).toBeNull()
    expect(talks).toBe(2)
  })
})
