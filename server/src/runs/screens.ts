import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Ekran haritası (seçici göz). Gözün incelediği her ekranın yapı izi (maskeli ağacın özeti, `uiPrint`) ve ekran
 * notları sayfa başına hafızada tutulur (`memory/apps/<p>/<u>/screens/<sayfa>/<yazar>.json`, Git'te). Her kişi yalnız
 * kendi dosyasına yazar (çakışma olmaz); okurken herkesinki birleştirilir, aynı ekran için en yeni not kullanılır.
 * Sonraki koşuda (kim koşarsa koşsun) aynı yapıdaki ekran yeniden incelenmez; notları karşılaştırma için Göz'e verilir.
 */
export interface ScreenRecord {
  label: string
  notes: string[]
  at: string
}

/** Kişinin dosyasında en çok bu kadar ekran kalır (en eskiler düşer): harita büyümez. */
export const MAX_SCREENS = 80

type Records = Record<string, ScreenRecord>

const readRecords = (file: string): Records => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Records
  } catch {
    // Bozuk dosya koşuyu düşürmez: o dosya yok sayılır, kişinin kendi dosyası ilk kayıtta yeniden yazılır.
    return {}
  }
}

export class ScreenMemory {
  private readonly own: string
  private readonly mine: Records
  private readonly merged: Records

  constructor(
    private readonly dir: string,
    author: string,
  ) {
    this.own = join(dir, `${author}.json`)
    this.merged = {}
    this.mine = existsSync(this.own) ? readRecords(this.own) : {}
    const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')) : []
    for (const name of files) {
      const records = join(dir, name) === this.own ? this.mine : readRecords(join(dir, name))
      for (const [print, record] of Object.entries(records))
        if (!this.merged[print] || this.merged[print].at < record.at) this.merged[print] = record
    }
  }

  get(print: string): ScreenRecord | null {
    return this.merged[print] ?? null
  }

  remember(print: string, label: string, notes: string[], at = new Date().toISOString()): void {
    const record = { label, notes, at }
    this.mine[print] = record
    this.merged[print] = record
    // En yeni MAX_SCREENS ekran, ize göre sıralı yazılır: aynı içerik aynı dosyayı verir (Git farkı küçük kalır).
    const kept = Object.entries(this.mine)
      .sort(([, a], [, b]) => b.at.localeCompare(a.at))
      .slice(0, MAX_SCREENS)
      .sort(([a], [b]) => a.localeCompare(b))
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.own, JSON.stringify(Object.fromEntries(kept), null, 2) + '\n')
  }
}
