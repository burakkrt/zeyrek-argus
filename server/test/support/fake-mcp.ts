/**
 * Sahte zeyrek-mcp: gerçek araçların adlarını ve yanıt biçimini taklit eder. Yalnız testler içindir.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const PROJECT_ID = '11111111-1111-1111-1111-111111111111'
const APPLICATION_ID = '22222222-2222-2222-2222-222222222222'
const PAGES = ['egt-liste', 'egt-sorunlu', 'egt-temiz'].map((slug) => ({
  id: `p-${slug}`,
  name: slug,
  slug,
  isHomepage: false,
}))

const server = new McpServer({ name: 'sahte-zeyrek-mcp', version: '0.0.0' })
const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })

server.registerTool('platform_whoami', { description: 'sahte' }, async () =>
  json({ user: process.env.USERNAME ?? null }),
)
server.registerTool(
  'project_list',
  { description: 'sahte', inputSchema: { searchTerm: z.string().optional() } },
  async () => json({ items: [{ id: PROJECT_ID, slug: 'qm', name: 'IMS Cortex' }] }),
)
server.registerTool(
  'application_list',
  { description: 'sahte', inputSchema: { projectId: z.string().optional() } },
  async () => json({ items: [{ id: APPLICATION_ID, slug: 'web', name: 'Web' }] }),
)
server.registerTool(
  'environment_list',
  { description: 'sahte', inputSchema: { projectId: z.string() } },
  async () =>
    json([
      { name: 'development', slug: 'development', state: 'ready' },
      { name: 'production', slug: 'production', state: 'ready' },
      { name: 'feature/yeni-ekran', slug: 'feature-yeni-ekran', state: 'ready' },
      { name: 'feature/yarim', slug: 'feature-yarim', state: 'creating' },
    ]),
)
server.registerTool(
  'page_list',
  {
    description: 'sahte',
    inputSchema: {
      project: z.string().optional(),
      environment: z.string().optional(),
      applicationId: z.string(),
    },
  },
  async () => json({ pages: PAGES }),
)
server.registerTool(
  'page_schema_get',
  {
    description: 'sahte',
    inputSchema: {
      project: z.string().optional(),
      environment: z.string().optional(),
      applicationId: z.string(),
      pageId: z.string(),
    },
  },
  async ({ pageId }) => json({ pageId, version: 7, schema: { root: { type: 'stack', children: [pageId] } } }),
)
server.registerTool('page_schema_patch', { description: 'sahte yazan araç' }, async () => json({ ok: true }))

await server.connect(new StdioServerTransport())
