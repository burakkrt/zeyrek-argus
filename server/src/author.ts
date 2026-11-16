import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'

/**
 * Bu makinenin yazar kimliği. Takımla paylaşılan dosyalar (`findings/<kimlik>.md`, `pages/<sayfa>/<kimlik>.md`) bu
 * kimlikle adlanır; kullanıcı belirlemez. Kimlik, işletim sisteminin makine kimliği ile oturumdaki kullanıcının özetidir:
 * uygulama silinip kurulsa, depo yeniden indirilse de aynı kalır; aynı makinedeki iki kullanıcı ayrı kimlik alır. Ham
 * makine kimliği ve kullanıcı adı Git'e girmez, yalnız özeti girer. Görünen ad (karar ve yorumlarda) Git'in
 * `user.name` ayarıdır; yoksa işletim sistemi kullanıcı adı.
 */
export interface Author {
  /** Dosya adı kimliği: `m-` + 12 onaltılık hane. */
  id: string
  /** Kararlarda ve yorumlarda görünen ad. */
  name: string
}

export const authorId = (machine: string, user: string): string =>
  `m-${createHash('sha256').update(`${machine}|${user}`).digest('hex').slice(0, 12)}`

const run = (command: string, args: string[], cwd?: string): string => {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', timeout: 5_000, windowsHide: true }).trim()
  } catch {
    return ''
  }
}

/**
 * İşletim sisteminin kalıcı makine kimliği (yönetici izni gerekmez): Windows `MachineGuid`, macOS `IOPlatformUUID`,
 * Linux `machine-id`. Okunamazsa bilgisayar adı.
 */
export function machineKey(): string {
  if (process.platform === 'win32') {
    const out = run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'])
    const guid = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out)?.[1]
    if (guid) return guid
  } else if (process.platform === 'darwin') {
    const uuid = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(
      run('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice']),
    )?.[1]
    if (uuid) return uuid
  } else {
    for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try {
        const id = readFileSync(file, 'utf8').trim()
        if (id) return id
      } catch {
        continue
      }
    }
  }
  return hostname()
}

/** Makinenin yazar kimliği ve görünen adı (`cwd`: Git ayarının okunacağı depo). */
export function detectAuthor(cwd: string): Author {
  const user = userInfo().username
  return {
    id: authorId(machineKey(), user),
    name: run('git', ['config', 'user.name'], cwd) || user || 'Argus kullanıcısı',
  }
}
