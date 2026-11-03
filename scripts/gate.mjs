// Quality gate for CI: fails when a gated model's pass rate drops below its threshold.
// The free model is reported but not gated: it is a comparison baseline, not the product.
// Usage: node scripts/gate.mjs results/eval.json
import { readFileSync } from 'node:fs';

const GATES = [
  { match: 'claude-haiku', min: 0.9 },
  { match: 'claude-sonnet', min: 0.9 },
];

const { results } = JSON.parse(readFileSync(process.argv[2] ?? 'results/latest.json', 'utf8')).results;
let failed = false;
for (const { match, min } of GATES) {
  const rows = results.filter((r) => r.provider.id.includes(match));
  if (!rows.length) continue;
  const rate = rows.filter((r) => r.success).length / rows.length;
  const ok = rate >= min;
  failed ||= !ok;
  console.log(`${ok ? '✓' : '✗'} ${match}: ${(rate * 100).toFixed(1)}% (gate ${min * 100}%)`);
}
process.exit(failed ? 1 : 0);
