import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ArgusError } from '../errors.ts'
import type { McpLaunch, PlatformCredentials } from './credentials.ts'

/**
 * Argus platforma yazmaz. Çağrılabilen araçlar bağlanırken sunucudan okunur: yalnız `readOnlyHint: true` işaretli
 * olanlar, kara liste hariç. Yazan, yayınlayan, çalıştıran (create, update, patch, delete, publish, execute, preview)
 * hiçbir araç bu kapıdan geçmez; işaretsiz araç da geçmez.
 */

/** Okuma işaretli olsa da çağrılmayan araçlar: kimlik bilgisi, oturum ayarı ve kişisel veri döndürenler. */
export const DENIED_TOOLS: ReadonlySet<string> = new Set([
  'connector_credential_list',
  'application_sign_in_get',
  'user_list',
  'user_position_list',
  'access_decision_log_list',
  'access_decision_log_summary',
  'access_decision_log_users',
  'notification_device_list',
  'notification_history',
])

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: unknown
}

/** Sunucunun araç listesinden çağrılabilecekler: okuma işaretli ve kara listede olmayanlar. */
export function readableTools(
  tools: Array<{
    name: string
    description?: string
    inputSchema?: unknown
    annotations?: { readOnlyHint?: boolean }
  }>,
): McpToolInfo[] {
  return tools
    .filter((t) => t.annotations?.readOnlyHint === true && !DENIED_TOOLS.has(t.name))
    .map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: t.inputSchema ?? {} }))
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
  /** Yalnız `readTools()` içindeki bir araç; başkası `TOOL_NOT_ALLOWED` ile reddedilir. */
  call(tool: string, args?: Record<string, unknown>): Promise<unknown>
  readTools(): McpToolInfo[]
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
  const listed: Parameters<typeof readableTools>[0] = []
  for (let cursor: string | undefined; ;) {
    const page = await client.listTools(cursor ? { cursor } : {})
    listed.push(...(page.tools as Parameters<typeof readableTools>[0]))
    cursor = page.nextCursor
    if (!cursor) break
  }
  const readable = readableTools(listed)
  const allowed = new Set(readable.map((t) => t.name))
  return {
    readTools: () => readable,
    async call(tool, args = {}) {
      if (!allowed.has(tool))
        throw new ArgusError(
          'TOOL_NOT_ALLOWED',
          `'${tool}' çağrılamaz: Argus yalnız okuma işaretli (readOnlyHint) ve kara listede olmayan araçları çağırır.`,
        )
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
