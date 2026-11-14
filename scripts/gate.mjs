// Quality gate for CI: fails when a gated model's pass rate drops below its threshold, when it has
// no results at all, or when too many calls errored for the score to mean anything.
// The free model is reported but not gated: it is a comparison baseline, not the product.
// Usage: node scripts/gate.mjs results/eval.json
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isError } from './summarize.mjs';

export const GATES = [
  { match: 'claude-haiku', min: 0.9 },
  { match: 'claude-sonnet', min: 0.9 },
];
export const MAX_ERROR_RATE = 0.1;

export function checkGates(results, gates = GATES) {
  return gates.map(({ match, min }) => {
    const rows = results.filter((r) => r.provider.id.includes(match));
    if (!rows.length) return { match, ok: false, message: `no results (renamed provider or filtered out?)` };
    const errors = rows.filter(isError).length;
    if (errors / rows.length > MAX_ERROR_RATE) return { match, ok: false, message: `${errors}/${rows.length} calls errored, score not trustworthy` };
    const graded = rows.length - errors;
    const rate = rows.filter((r) => r.success).length / graded;
    return { match, ok: rate >= min, message: `${(rate * 100).toFixed(1)}% of ${graded} graded, ${errors} errored (gate ${min * 100}%)` };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { results } = JSON.parse(readFileSync(process.argv[2] ?? 'results/latest.json', 'utf8')).results;
  const checks = checkGates(results);
  for (const { match, ok, message } of checks) console.log(`${ok ? '✓' : '✗'} ${match}: ${message}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
