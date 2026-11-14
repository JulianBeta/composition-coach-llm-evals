// Turns a Promptfoo results file into a Markdown model comparison (pass rate per metric,
// latency, tokens and cost). Used for docs/RESULTS.md and the GitHub Actions job summary.
// Usage: node scripts/summarize.mjs [results/latest.json] > docs/RESULTS.md
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// USD per 1M tokens, at paid-tier rates. On a free-tier Gemini key the real cost is $0.
const PRICES = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 }, // through 2026-12-31; $1.50 / $7.50 from 2027-01-01
};
const JUDGE_PRICE = PRICES['claude-sonnet-5-5']; // Sonnet grades every model (promptfooconfig.yaml).

// Promptfoo's ResultFailureReason: 1 = an assertion failed, 2 = the call itself errored (429, timeout…).
export const isError = (r) => r.failureReason === 2;
export const isFiltered = (r) => r.response?.finishReason === 'content_filter';

const usd = (tokens, price) => (tokens.input * price.input + tokens.output * price.output) / 1e6;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const count = (n) => n.toLocaleString('en-US');

export function summarize(data, file = 'results') {
  const results = data.results.results;
  const models = new Map();
  for (const r of results) {
    const label = r.provider.label ?? r.provider.id;
    const m = models.get(label) ?? { id: r.provider.id, graded: 0, passed: 0, errors: [], latency: [], prompt: 0, completion: 0, judgePrompt: 0, judgeCompletion: 0, metrics: {}, failures: [] };
    models.set(label, m);
    m.prompt += r.response?.tokenUsage?.prompt ?? 0;
    m.completion += r.response?.tokenUsage?.completion ?? 0;
    const what = r.testCase.description ?? `${r.testCase.metadata?.pluginId} / ${r.testCase.metadata?.strategyId ?? 'basic'}`;
    // An errored call says nothing about the model, so it stays out of the pass rate.
    if (isError(r)) {
      m.errors.push(`${what}: ${String(r.error ?? 'unknown error').split('\n')[0].slice(0, 160)}`);
      continue;
    }
    m.graded += 1;
    if (r.success) m.passed += 1;
    m.latency.push(r.latencyMs ?? 0);
    m.judgePrompt += r.gradingResult?.tokensUsed?.prompt ?? 0;
    m.judgeCompletion += r.gradingResult?.tokensUsed?.completion ?? 0;
    for (const c of r.gradingResult?.componentResults ?? []) {
      const s = (m.metrics[c.assertion?.metric ?? 'other'] ??= { pass: 0, total: 0 });
      s.total += 1;
      if (c.pass) s.pass += 1;
    }
    if (!r.success) {
      const why = isFiltered(r) ? `empty reply: ${r.response.guardrails?.reason ?? 'safety filter refusal'}` : (r.gradingResult?.reason ?? r.error ?? '');
      m.failures.push(`${what}: ${why.split('\n')[0].slice(0, 160)}`);
    }
  }

  const isRedTeam = results.some((r) => r.testCase.metadata?.pluginId);
  const ranOn = String(data.results.timestamp ?? '').slice(0, 10) || 'unknown date';
  const price = (id) => Object.entries(PRICES).find(([key]) => id.includes(key))?.[1];
  const metrics = [...new Set([...models.values()].flatMap((m) => Object.keys(m.metrics)))].sort();

  const out = [];
  out.push(isRedTeam ? `# Red team` : `# Model comparison`, '');
  out.push(`_Run on ${ranOn} · from \`${file}\` · ${results.length} results · judge: LLM-as-a-judge (see promptfooconfig.yaml). Pass rate covers graded results; errored calls are counted separately._`, '');
  out.push(`| Model | Pass rate | Errors | Median latency | Tokens (in / out) | Est. model cost | Judge tokens | Est. judge cost |`, `|---|---:|---:|---:|---:|---:|---:|---:|`);
  for (const [label, m] of models) {
    const p = price(m.id);
    const cost = p ? `$${usd({ input: m.prompt, output: m.completion }, p).toFixed(4)}` : 'n/a';
    const judge = usd({ input: m.judgePrompt, output: m.judgeCompletion }, JUDGE_PRICE);
    out.push(`| ${label} | ${pct(m.passed, m.graded)} (${m.passed}/${m.graded}) | ${m.errors.length} | ${(median(m.latency) / 1000).toFixed(1)} s | ${count(m.prompt)} / ${count(m.completion)} | ${cost} | ${count(m.judgePrompt + m.judgeCompletion)} | $${judge.toFixed(4)} |`);
  }

  if (!isRedTeam) {
    out.push('', `## Pass rate by metric`, '', `| Model | ${metrics.join(' | ')} |`, `|---|${metrics.map(() => '---:').join('|')}|`);
    for (const [label, m] of models) out.push(`| ${label} | ${metrics.map((k) => (m.metrics[k] ? pct(m.metrics[k].pass, m.metrics[k].total) : '–')).join(' | ')} |`);
  } else {
    // Red-team results carry the attack's plugin and strategy in the test metadata. "Passed" alone
    // overstates the prompt's strength: a provider filter's empty reply also passes the grader.
    const outcome = (rows) => ({
      total: rows.length,
      model: rows.filter((r) => r.success && !isFiltered(r)).length,
      filter: rows.filter((r) => r.success && isFiltered(r)).length,
      failed: rows.filter((r) => !r.success && !isError(r)).length,
      errors: rows.filter(isError).length,
    });
    const header = (name) => [`| ${name} | Attacks | Answered safely by the model | Blocked by provider filter (empty reply) | Failed | Errors |`, `|---|---:|---:|---:|---:|---:|`];
    const line = (name, o) => `| ${name} | ${o.total} | ${o.model} | ${o.filter} | ${o.failed} | ${o.errors} |`;
    const table = (key) => {
      const groups = Map.groupBy(results, (r) => r.testCase.metadata?.[key] ?? 'basic');
      return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([k, rows]) => line(k, outcome(rows)));
    };
    out.push('', `## Red team: outcome by model`, '', ...header('Model'));
    for (const [label, rows] of Map.groupBy(results, (r) => r.provider.label ?? r.provider.id)) out.push(line(label, outcome(rows)));
    out.push('', `## Red team: outcome by plugin`, '', ...header('Plugin'), ...table('pluginId'));
    out.push('', `## Red team: outcome by strategy`, '', ...header('Strategy'), ...table('strategyId'));
  }

  out.push('', `## Failures`, '');
  const failures = [...models].flatMap(([label, m]) => m.failures.map((f) => `- **${label}** · ${f}`));
  out.push(...(failures.length ? failures : ['None.']));
  const errors = [...models].flatMap(([label, m]) => m.errors.map((e) => `- **${label}** · ${e}`));
  if (errors.length) out.push('', `## Errored calls (not graded)`, '', ...errors);
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? 'results/latest.json';
  console.log(summarize(JSON.parse(readFileSync(file, 'utf8')), file));
}
