import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'dotenv'
import { ArgusError } from '../errors.ts'

/** zeyrek-mcp'nin kullandığı platform bilgisi; Argus bunu kendisi saklamaz, zeyrek-mcp/.env'den okur. */
export interface PlatformCredentials {
  orgApiBaseUrl: string
  tenantApiBaseUrl: string
  organization: string
  hostSuffix: string
  studioBaseUrl: string
  token?: string
  username?: string
  password?: string
}

/** MCP sunucusunu başlatma komutu. Gerçekte zeyrek-mcp kaynaktan (tsx), testte sahte sunucu. */
export interface McpLaunch {
  command: string
  args: string[]
}

export interface PlatformAccess {
  credentials: PlatformCredentials
  launch: McpLaunch
  envFile: string
}

export function zeyrekMcpLaunch(zeyrekAppDir: string): McpLaunch {
  const mcpDir = join(zeyrekAppDir, 'zeyrek-mcp')
  return {
    command: process.execPath,
    args: [
      join(mcpDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      join(mcpDir, 'src', 'index.ts'),
      '--stdio',
    ],
  }
}

export function loadPlatformAccess(zeyrekAppDir: string | null): PlatformAccess {
  if (!zeyrekAppDir) {
    throw new ArgusError(
      'NO_ZEYREK_APP',
      '.env dosyasında ARGUS_ZEYREK_APP_DIR boş; Zeyrek App klasörünün yolunu yazın.',
    )
  }
  const envFile = join(zeyrekAppDir, 'zeyrek-mcp', '.env')
  if (!existsSync(envFile))
    throw new ArgusError('NO_MCP_ENV', `zeyrek-mcp ayar dosyası bulunamadı: ${envFile}`)
  const launch = zeyrekMcpLaunch(zeyrekAppDir)
  if (!existsSync(launch.args[0]!)) {
    throw new ArgusError(
      'NO_MCP_DEPS',
      `zeyrek-mcp kurulmamış: ${launch.args[0]} yok. zeyrek-mcp içinde npm install çalıştırın.`,
    )
  }
  return { credentials: parseCredentials(readFileSync(envFile, 'utf8'), envFile), launch, envFile }
}

export function parseCredentials(content: string, source: string): PlatformCredentials {
  const raw = parse(content)
  const value = (key: string) => (raw[key] ?? '').trim()
  const required = (key: string) => {
    const v = value(key)
    if (!v) throw new ArgusError('MCP_ENV', `${source}: ${key} boş.`)
    return v
  }
  const credentials: PlatformCredentials = {
    orgApiBaseUrl: required('ORG_API_BASE_URL').replace(/\/+$/, ''),
    tenantApiBaseUrl: required('TENANT_API_BASE_URL').replace(/\/+$/, ''),
    organization: required('ORGANIZATION'),
    hostSuffix: required('HOST_SUFFIX'),
    studioBaseUrl: required('STUDIO_BASE_URL').replace(/\/+$/, ''),
    ...(value('TOKEN') ? { token: value('TOKEN') } : {}),
    ...(value('USERNAME') ? { username: value('USERNAME') } : {}),
    ...(value('PASSWORD') ? { password: value('PASSWORD') } : {}),
  }
  if (!credentials.token && !(credentials.username && credentials.password)) {
    throw new ArgusError('MCP_ENV', `${source}: TOKEN ya da USERNAME + PASSWORD gerekli.`)
  }
  return credentials
}

/** Arayüzde gösterilecek, sır içermeyen özet. */
export function describeAccess(access: PlatformAccess): {
  host: string
  organization: string
  envFile: string
} {
  return {
    host: new URL(access.credentials.studioBaseUrl).host,
    organization: access.credentials.organization,
    envFile: access.envFile,
  }
}
