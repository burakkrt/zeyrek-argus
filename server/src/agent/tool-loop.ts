import type { ContentBlock, Message, MessageParam } from './model.ts'

/**
 * Araç döngüsü (strateji ve tanım araştırması): model araç çağırır, sonuç döner, model bitiş aracını çağırana kadar
 * sürer. Sınır kapsamı daraltmak için değil, kaçağı durdurmak içindir: aynı çağrının (ad + girdi) ikiden fazla
 * tekrarı ilerleme sayılmaz; üst üste `NO_PROGRESS_LIMIT` tur ilerlemeyen döngü biter; `ceiling` son çaredir.
 * Model araç çağırmadan konuşursa bitiş aracını çağırması bir kez hatırlatılır.
 */
const REPEAT_LIMIT = 2
const NO_PROGRESS_LIMIT = 4

export type LoopReply<T> = string | { done: T }

export async function toolLoop<T>(input: {
  call: (messages: MessageParam[]) => Promise<Message>
  first: ContentBlock[]
  handle: (name: string, input: unknown) => Promise<LoopReply<T>>
  finishTool: string
  ceiling: number
}): Promise<T | null> {
  const messages: MessageParam[] = [{ role: 'user', content: input.first }]
  const repeats = new Map<string, number>()
  let idle = 0
  let nudged = false
  for (let round = 0; round < input.ceiling; round += 1) {
    const response = await input.call(messages)
    messages.push({ role: 'assistant', content: response.content })
    const uses = response.content.filter((b) => b.type === 'tool_use')
    if (!uses.length) {
      if (nudged) return null
      nudged = true
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: `Bitirmek için ${input.finishTool} aracını çağır.` }],
      })
      continue
    }
    const results: ContentBlock[] = []
    let progressed = false
    for (const use of uses) {
      if (use.type !== 'tool_use') continue
      const signature = `${use.name}:${JSON.stringify(use.input)}`
      const seen = (repeats.get(signature) ?? 0) + 1
      repeats.set(signature, seen)
      const reply = await input.handle(use.name, use.input)
      if (typeof reply !== 'string') return reply.done
      if (seen <= REPEAT_LIMIT) progressed = true
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content:
          seen > REPEAT_LIMIT
            ? `${reply}\nBu çağrıyı aynen daha önce yaptın; başka bir şey dene ya da bitir.`
            : reply,
      })
    }
    idle = progressed ? 0 : idle + 1
    if (idle >= NO_PROGRESS_LIMIT) return null
    messages.push({ role: 'user', content: results })
  }
  return null
}
