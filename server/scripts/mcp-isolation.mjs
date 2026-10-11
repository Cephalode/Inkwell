// Cross-tenant check: user B must not see user A's MCP-created deck.
// Run: node server/scripts/mcp-isolation.mjs <tokenB>
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const token = process.argv[2];
const c = new Client({ name: 'smoke-isolation', version: '0' });
await c.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3099/mcp'), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
const text = (r) => r.content.map((p) => p.text).join('\n');

const decks = JSON.parse(text(await c.callTool({ name: 'list_flashcard_decks', arguments: {} })));
const leaked = decks.filter((d) => d.title === 'MCP smoke deck');
const docs = JSON.parse(text(await c.callTool({ name: 'list_documents', arguments: {} })));

console.log(`${leaked.length === 0 ? 'PASS' : 'FAIL'}  tenant isolation: B sees ${decks.length} deck(s), 0 A-decks, ${docs.length} doc(s)`);
process.exit(leaked.length === 0 ? 0 : 1);
