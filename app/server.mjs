// Local chat UI for Coda. Uses the same system prompt and Claude provider settings as the evals,
// and authenticates the same way: ANTHROPIC_API_KEY if set, otherwise your Claude Code session.
// Usage: npm run chat  (then open http://localhost:3000)
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { load } from 'js-yaml';

// Load .env like the Promptfoo CLI does (variables already set in the shell win).
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.PROMPTFOO_DISABLE_TELEMETRY ??= '1';
process.env.PROMPTFOO_CACHE_ENABLED ??= 'false'; // a chat should answer fresh every time
const { loadApiProvider } = await import('promptfoo');

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const SYSTEM = read('prompts/coda-system.md');
const PORT = Number(process.env.PORT ?? 3000);

// Only the Claude models that are active in promptfooconfig.yaml, so the UI and the evals match.
const models = load(read('promptfooconfig.yaml'))
  .providers.filter((p) => p.id.startsWith('anthropic:'))
  .map((p) => ({ id: p.id, label: p.label, config: p.config }));
const providers = new Map();
const provider = async (id) => {
  const m = models.find((x) => x.id === id) ?? models[0];
  if (!providers.has(m.id)) providers.set(m.id, await loadApiProvider(m.id, { options: { config: m.config } }));
  return providers.get(m.id);
};

const MAX_TURNS = 40;
const MAX_CHARS = 8000;
const validHistory = (messages) =>
  Array.isArray(messages) && messages.length > 0 && messages.length <= MAX_TURNS &&
  messages.every((m, i) => m && typeof m.content === 'string' && m.content.length <= MAX_CHARS &&
    m.role === (i % 2 === 0 ? 'user' : 'assistant'));

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

async function chat(req, res) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_TURNS * MAX_CHARS) return send(res, 413, { error: 'Conversation too long.' });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Invalid JSON.' }); }
  if (!validHistory(body.messages)) return send(res, 400, { error: 'Invalid conversation.' });

  const started = Date.now();
  const p = await provider(body.model);
  const r = await p.callApi(JSON.stringify([{ role: 'system', content: SYSTEM }, ...body.messages]));
  if (r.error) {
    console.error('[chat]', r.error);
    return send(res, 502, { error: 'The model call failed. Check the server terminal: is ANTHROPIC_API_KEY valid, or run `claude /login`.' });
  }
  const output = typeof r.output === 'string' ? r.output : '';
  // F-001: a safety-filter refusal comes back empty. Show a fallback instead of a blank bubble.
  send(res, 200, { output, refused: output.trim() === '', ms: Date.now() - started, tokens: r.tokenUsage ?? null });
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && pathname === '/') return send(res, 200, read('app/index.html'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && pathname === '/marked.js')
      return send(res, 200, read('node_modules/marked/lib/marked.esm.js'), 'text/javascript; charset=utf-8');
    if (req.method === 'GET' && pathname === '/api/models') return send(res, 200, models.map(({ id, label }) => ({ id, label })));
    if (req.method === 'POST' && pathname === '/api/chat') return await chat(req, res);
    send(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) send(res, 500, { error: 'Server error. See the terminal.' });
  }
});

// Localhost only: the server spends your Claude credentials, so it must not be reachable from the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Coda chat running at http://localhost:${PORT}  (models: ${models.map((m) => m.label).join(', ')})`);
  console.log(process.env.ANTHROPIC_API_KEY ? 'Auth: ANTHROPIC_API_KEY' : 'Auth: Claude Code session (no ANTHROPIC_API_KEY set; run `claude /login` if calls fail)');
});
