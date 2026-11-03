// Turns a Promptfoo results file into a Markdown model comparison (pass rate per metric,
// latency, tokens and cost). Used for docs/RESULTS.md and the GitHub Actions job summary.
// Usage: node scripts/summarize.mjs [results/latest.json] > docs/RESULTS.md
import { readFileSync } from 'node:fs';

// USD per 1M tokens. Groq's free tier costs nothing to run; paid Groq pricing differs.
const PRICES = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'qwen3.8-27b': { input: 0, output: 0 },
};

const file = process.argv[2] ?? 'results/latest.json';
const data = JSON.parse(readFileSync(file, 'utf8'));
const results = data.results.results;

const models = new Map();
for (const r of results) {
  const label = r.provider.label ?? r.provider.id;
  const m = models.get(label) ?? { id: r.provider.id, tests: 0, passed: 0, errors: 0, latency: [], prompt: 0, completion: 0, metrics: {}, failures: [] };
  m.tests += 1;
  if (r.success) m.passed += 1;
  if (r.error && !r.gradingResult) m.errors += 1;
  m.latency.push(r.latencyMs ?? 0);
  m.prompt += r.response?.tokenUsage?.prompt ?? 0;
  m.completion += r.response?.tokenUsage?.completion ?? 0;
  for (const c of r.gradingResult?.componentResults ?? []) {
    const metric = c.assertion?.metric ?? 'other';
    const s = (m.metrics[metric] ??= { pass: 0, total: 0 });
    s.total += 1;
    if (c.pass) s.pass += 1;
  }
  if (!r.success) {
    const what = r.testCase.description ?? `${r.testCase.metadata?.pluginId} / ${r.testCase.metadata?.strategyId ?? 'basic'}`;
    const why = r.response?.finishReason === 'content_filter' ? `empty reply: ${r.response.guardrails?.reason ?? 'safety filter refusal'}` : (r.gradingResult?.reason ?? r.error ?? '');
    m.failures.push(`${what}: ${why.split('\n')[0].slice(0, 160)}`);
  }
  models.set(label, m);
}

const price = (id) => Object.entries(PRICES).find(([key]) => id.includes(key))?.[1];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const metrics = [...new Set([...models.values()].flatMap((m) => Object.keys(m.metrics)))].sort();

const out = [];
out.push(`# Model comparison`, '');
out.push(`_Generated from \`${file}\` on ${new Date().toISOString().slice(0, 10)} · ${results.length} results · judge: LLM-as-a-judge (see promptfooconfig.yaml)._`, '');
out.push(`| Model | Pass rate | Median latency | Tokens (in / out) | Est. cost |`, `|---|---:|---:|---:|---:|`);
for (const [label, m] of models) {
  const p = price(m.id);
  const cost = p ? `$${((m.prompt * p.input + m.completion * p.output) / 1e6).toFixed(4)}` : 'n/a';
  out.push(`| ${label} | ${pct(m.passed, m.tests)} (${m.passed}/${m.tests}) | ${(median(m.latency) / 1000).toFixed(1)} s | ${m.prompt.toLocaleString('en-US')} / ${m.completion.toLocaleString('en-US')} | ${cost} |`);
}
const isRedTeam = results.some((r) => r.testCase.metadata?.pluginId);
if (!isRedTeam) {
  out.push('', `## Pass rate by metric`, '', `| Model | ${metrics.join(' | ')} |`, `|---|${metrics.map(() => '---:').join('|')}|`);
  for (const [label, m] of models) out.push(`| ${label} | ${metrics.map((k) => (m.metrics[k] ? pct(m.metrics[k].pass, m.metrics[k].total) : '–')).join(' | ')} |`);
}
// Red-team results carry the attack's plugin and strategy in the test metadata.
const attacks = isRedTeam ? results : [];
if (attacks.length) {
  const table = (key) => {
    const rows = new Map();
    for (const r of attacks) {
      const k = r.testCase.metadata[key] ?? 'basic';
      const row = rows.get(k) ?? { defended: 0, total: 0, refused: 0 };
      row.total += 1;
      if (r.success) row.defended += 1;
      if (r.response?.finishReason === 'content_filter') row.refused += 1;
      rows.set(k, row);
    }
    return [...rows].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `| ${k} | ${v.defended}/${v.total} | ${v.refused} |`);
  };
  out.push('', `## Red team: attacks defended by plugin`, '', `| Plugin | Defended | Safety-filter refusals (empty reply) |`, `|---|---:|---:|`, ...table('pluginId'));
  out.push('', `## Red team: attacks defended by strategy`, '', `| Strategy | Defended | Safety-filter refusals (empty reply) |`, `|---|---:|---:|`, ...table('strategyId'));
}

out.push('', `## Failures`, '');
let any = false;
for (const [label, m] of models)
  for (const f of m.failures) {
    any = true;
    out.push(`- **${label}** · ${f}`);
  }
if (!any) out.push('None.');
console.log(out.join('\n'));
