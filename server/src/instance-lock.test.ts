import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acquireInstanceLock } from './instance-lock.ts'

const dir = () => mkdtempSync(join(tmpdir(), 'argus-kilit-'))

describe('acquireInstanceLock', () => {
  it('canlı başka bir sunucunun kilidi varken açılmaz', () => {
    const data = dir()
    writeFileSync(join(data, 'argus.lock'), String(process.ppid))
    expect(() => acquireInstanceLock(data)).toThrow(/zaten çalışıyor/)
  })

  it('sahibi ölmüş bayat kilidi devralır; bırakınca dosya silinir', () => {
    const data = dir()
    writeFileSync(join(data, 'argus.lock'), '999999999')
    const release = acquireInstanceLock(data)
    expect(readFileSync(join(data, 'argus.lock'), 'utf8')).toBe(String(process.pid))
    release()
    expect(existsSync(join(data, 'argus.lock'))).toBe(false)
  })
})
