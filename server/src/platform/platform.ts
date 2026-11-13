import type { Config } from '../config.ts'
import { Catalog } from './catalog.ts'
import { loadPlatformAccess, type PlatformAccess } from './credentials.ts'
import { connectMcp, type McpClient } from './mcp.ts'

/**
 * Platforma tek giriş noktası: zeyrek-mcp bağlantısı (tembel, koparsa yeniden kurulur) ve katalog.
 * Testte `access` dışarıdan verilir (sahte MCP + sahte site).
 */
export class Platform {
  private client: Promise<McpClient> | null = null
  private loaded: PlatformAccess | null = null
  readonly catalog: Catalog

  constructor(
    private readonly config: Pick<Config, 'zeyrekAppDir' | 'dataDir'>,
    private readonly injected?: PlatformAccess,
  ) {
    this.catalog = new Catalog(() => this.mcp())
  }

  access(): PlatformAccess {
    if (this.injected) return this.injected
    this.loaded ??= loadPlatformAccess(this.config.zeyrekAppDir)
    return this.loaded
  }

  mcp(): Promise<McpClient> {
    if (!this.client) {
      const access = this.access()
      this.client = connectMcp({
        launch: access.launch,
        credentials: access.credentials,
        dataDir: this.config.dataDir,
      }).catch((error: unknown) => {
        this.client = null
        throw error
      })
    }
    return this.client
  }

  /** Bağlantıyı ve okunan ayarı bırakır; bir sonraki çağrı yeniden kurar. */
  async reset(): Promise<void> {
    const current = this.client
    this.client = null
    this.loaded = null
    await current?.then((c) => c.close()).catch(() => undefined)
  }

  async close(): Promise<void> {
    await this.reset()
  }
}
