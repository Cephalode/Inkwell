// MCP smoke test for the Inkwell server. Run: node /tmp/mcp-smoke.mjs <token>
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const TOKEN = process.argv[2];
const MCP_URL = 'http://localhost:3099/mcp';
const fails = [];
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) fails.push(name);
};

async function connect(token) {
  const c = new Client({ name: 'smoke', version: '0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined));
  return c;
}

// 1. No token → must be rejected
try {
  await connect(null);
  check('reject no-token', false, 'connected without auth');
} catch (e) { check('reject no-token', true, String(e).slice(0, 60)); }

// 2. Garbage token → must be rejected
try {
  await connect('not-a-real-token');
  check('reject bad-token', false, 'connected with junk token');
} catch (e) { check('reject bad-token', true, String(e).slice(0, 60)); }

// 3. Real token → full round trip
const c = await connect(TOKEN);

const tools = await c.listTools();
const names = tools.tools.map((t) => t.name).sort();
const expected = ['add_flashcards', 'find_videos', 'get_flashcards', 'get_learning_overview', 'get_roadmap', 'list_documents', 'list_flashcard_decks', 'log_review', 'read_document'];
check('lists 9 tools', names.length === 9 && expected.every((n) => names.includes(n)), names.join(', '));

const text = (r) => r.content.map((p) => p.text).join('\n');

const docs = JSON.parse(text(await c.callTool({ name: 'list_documents', arguments: {} })));
check('list_documents runs (scoped user)', Array.isArray(docs), `${docs.length} docs (test user owns 0)`);

const ov = text(await c.callTool({ name: 'get_learning_overview', arguments: {} }));
check('get_learning_overview runs', ov.includes('courses') && ov.includes('skills'), ov.slice(0, 80).replace(/\n/g, ' '));

const fv = text(await c.callTool({ name: 'find_videos', arguments: { skill_id: 'nope' } }));
check('find_videos handles bad skill', fv.length > 0, fv.slice(0, 80).replace(/\n/g, ' '));

const rd = text(await c.callTool({ name: 'read_document', arguments: { document_id: 'nope' } }));
check('read_document handles missing doc', rd.toLowerCase().includes('not found'), rd.slice(0, 60));

const mk = text(await c.callTool({
  name: 'add_flashcards',
  arguments: { title: 'MCP smoke deck', description: 'created by mcp-smoke.mjs', cards: [{ front: 'What did we build?', back: 'The Inkwell MCP server' }, { front: 'Transport?', back: 'Streamable HTTP, stateless' }] },
}));
check('add_flashcards creates deck', mk.includes('with 2 cards'), mk.slice(0, 90));

const decks = JSON.parse(text(await c.callTool({ name: 'list_flashcard_decks', arguments: {} })));
const deck = decks.find((d) => d.title === 'MCP smoke deck');
check('new deck visible to same user', !!deck && deck.cards === 2, `${decks.length} deck(s)`);

const deckText = text(await c.callTool({ name: 'get_flashcards', arguments: { deck_id: deck.id } }));
const cards = JSON.parse(deckText.slice(deckText.indexOf('\n') + 1)); // strip "# title" line
check('get_flashcards returns cards', cards.length === 2 && cards[0].front === 'What did we build?');

const rv = text(await c.callTool({ name: 'log_review', arguments: { card_id: cards[0].id, correct: true } }));
const stats = JSON.parse(rv);
check('log_review updates stats', stats.review_stats.timesReviewed === 1 && stats.review_stats.timesCorrect === 1);

const rv2 = text(await c.callTool({ name: 'log_review', arguments: { card_id: cards[1].id, correct: false } }));
check('log_review counts wrong', JSON.parse(rv2).review_stats.timesCorrect === 0);

// Cross-tenant check: a second user must NOT see the deck
const { Client: C2 } = await import('@modelcontextprotocol/sdk/client/index.js');
const c2 = new C2({ name: 'smoke2', version: '0' });
console.log('(skipping second-user isolation — needs a second minted token)'.replace(/\s+/g, ' '));

await c.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
