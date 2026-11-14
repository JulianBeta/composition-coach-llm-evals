// Regenerates docs/RESULTS.md from the committed baseline reports.
// Usage: npm run report
import { readFileSync, writeFileSync } from 'node:fs';
import { summarize } from './summarize.mjs';

const section = (file) => summarize(JSON.parse(readFileSync(file, 'utf8')), file);
const body = ['reports/baseline/eval.json', 'reports/baseline/redteam-quick.json'].map(section).join('\n\n');
writeFileSync('docs/RESULTS.md', `${body}\n`);
console.log('docs/RESULTS.md updated');
