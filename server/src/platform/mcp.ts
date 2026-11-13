import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ArgusError } from '../errors.ts'
import type { McpLaunch, PlatformCredentials } from './credentials.ts'

/**
 * Argus platforma yazmaz. Bu liste yalnız okuyan araçlarla büyür; create, update, patch, delete, publish,
 * execute gibi yazan bir araç eklenmez.
 */
export const READ_ONLY_TOOLS = [
  'platform_whoami',
  'project_list',
  'application_list',
  'environment_list',
  'page_list',
  'page_get',
  'page_schema_get',
] as const

export type ReadOnlyTool = (typeof READ_ONLY_TOOLS)[number]

export function assertReadOnlyTool(name: string): asserts name is ReadOnlyTool {
  if (!(READ_ONLY_TOOLS as readonly string[]).includes(name)) {
    throw new ArgusError(
      'TOOL_NOT_ALLOWED',
      `'${name}' aracı izin listesinde yok; Argus yalnız okuyan araçları çağırır.`,
    )
  }
}

/** Alt sürece üst sürecin ortamından yalnız bunlar geçer; platform bilgisi açıkça verilir. */
const PASSTHROUGH_ENV = [
  'PATH',
  'Path',
  'PATHEXT',
  'SYSTEMROOT',
  'SystemRoot',
  'SYSTEMDRIVE',
  'COMSPEC',
  'ComSpec',
  'WINDIR',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'NODE_EXTRA_CA_CERTS',
] as const

export function childEnv(
  credentials: PlatformCredentials,
  logDir: string,
  parent = process.env,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of PASSTHROUGH_ENV) {
    const value = parent[key]
    if (value) env[key] = value
  }
  return {
    ...env,
    ORG_API_BASE_URL: credentials.orgApiBaseUrl,
    TENANT_API_BASE_URL: credentials.tenantApiBaseUrl,
    ORGANIZATION: credentials.organization,
    HOST_SUFFIX: credentials.hostSuffix,
    STUDIO_BASE_URL: credentials.studioBaseUrl,
    DEFAULT_ENVIRONMENT: 'development',
    AUTH_MODE: 'local',
    LOG_DIR: logDir,
    LOG_LEVEL: 'summary',
    TOKEN: credentials.token ?? '',
    // MCP SDK Windows'ta işletim sisteminin USERNAME'ini geçirir; platform kullanıcısıyla ezilir.
    USERNAME: credentials.username ?? '',
    PASSWORD: credentials.password ?? '',
  }
}

export interface McpClient {
  call(tool: ReadOnlyTool, args?: Record<string, unknown>): Promise<unknown>
  close(): Promise<void>
}

function payloadOf(result: { content?: unknown; structuredContent?: unknown }): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  const text = (Array.isArray(result.content) ? result.content : [])
    .filter((b): b is { type: 'text'; text: string } => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function connectMcp(input: {
  launch: McpLaunch
  credentials: PlatformCredentials
  dataDir: string
}): Promise<McpClient> {
  const logDir = join(input.dataDir, 'logs', 'mcp')
  const cwd = join(input.dataDir, 'mcp-cwd')
  mkdirSync(logDir, { recursive: true })
  mkdirSync(cwd, { recursive: true })
  const transport = new StdioClientTransport({
    command: input.launch.command,
    args: input.launch.args,
    env: childEnv(input.credentials, logDir),
    cwd,
    stderr: 'pipe',
  })
  let stderrTail = ''
  transport.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2000)
  })
  const client = new Client({ name: 'zeyrek-argus', version: '2.0.0' })
  try {
    await client.connect(transport)
  } catch (error) {
    const detail = stderrTail.trim() ? `\nSunucu çıktısı:\n${stderrTail.trim()}` : ''
    throw new ArgusError('MCP_CONNECT', `zeyrek-mcp başlatılamadı: ${String(error)}${detail}`, {
      cause: error,
    })
  }
  return {
    async call(tool, args = {}) {
      assertReadOnlyTool(tool)
      const result = (await client.callTool({ name: tool, arguments: args })) as {
        content?: unknown
        structuredContent?: unknown
        isError?: boolean
      }
      const payload = payloadOf(result)
      if (result.isError) {
        throw new ArgusError(
          'MCP_TOOL',
          `${tool}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
        )
      }
      return payload
    },
    close: () => client.close(),
  }
}
